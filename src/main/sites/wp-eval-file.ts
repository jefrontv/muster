// wp eval-file with a temp file we own and always delete.
//
// Bypasses checkWpCliSafety on purpose: the banned verbs are the point. Callers either pass our
// bundled ACF runner or a size-capped agent body. Extra argv still go through wpCliArgLooksDangerous
// and quoteShellArgument so nothing on the remote command line can break out of a token.

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { streamCommand, type StreamCommandResult } from '../lib/stream-command'
import type { SiteLocalStack } from '../../shared/site-types'
import { evalFileNames, localEvalFiles } from './local-eval-file-paths'
import { buildLocalWpCliSpawn, ddevWpCliSpawnError } from './local-wp-cli-command'
import { createLocalWpHost } from './localwp-host'
import { buildLocalWpWpEnv } from './localwp-wp-cli-environment'
import {
  quoteShellArgument,
  SiteRunCancelledError,
  SiteRunStepError,
  type SiteSshSession
} from './pipeline-contract'
import {
  WP_CLI_DEFAULT_TIMEOUT_MS,
  WP_CLI_MAX_OUTPUT_CHARS,
  wpCliArgLooksDangerous,
  type LocalWpEnvResolver
} from './wp-cli-runner'

export const WP_EVAL_FILE_STEP = 'wp-eval-file'
export const WP_EVAL_FILE_MAX_BYTES = 64 * 1024
// The 64 KB cap bounds what an agent sends. Muster's own bundled runners are trusted and grow with
// every ACF feature, so they get their own ceiling instead of silently breaking every field call.
export const WP_EVAL_BUNDLED_MAX_BYTES = 256 * 1024
// Same reasoning for the answer: the walker's JSON for a 260-row flex field dwarfs the 50,000-char
// tail an agent's own script needs, and a cut envelope is unparseable rather than merely shorter.
// Kept under the SSH layer's own 1 MiB buffer so the cut, when it comes, is this one.
export const WP_EVAL_BUNDLED_MAX_OUTPUT_CHARS = 1_000_000
export const WP_EVAL_SIDECAR_MAX_BYTES = 256 * 1024
// A restore carries the whole snapshot back as its payload, so that one mode buys a bigger sidecar.
export const WP_EVAL_RESTORE_SIDECAR_MAX_BYTES = 32 * 1024 * 1024
// A snapshot of a 260-row page dwarfs any stdout ceiling, so the walker writes it beside the
// payload and we collect the file instead.
export const WP_EVAL_OUTPUT_FILE_MAX_BYTES = 64 * 1024 * 1024

const WP_BINARY = 'wp'
const WP_EVAL_MIN_TIMEOUT_MS = 5_000
const WP_EVAL_MAX_TIMEOUT_MS = 120_000

export type WpEvalFileResult = {
  code: number
  stdout: string
  stderr: string
  stdoutTruncated: boolean
  stderrTruncated: boolean
  command: string
  outputFileContents?: string
}

export type WpEvalFileRequest = {
  php: string
  args?: readonly string[]
  sidecar?: string
  maxPhpBytes?: number
  maxOutputChars?: number
  maxSidecarBytes?: number
  collectOutputFile?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}

function assertEvalPayload(
  php: string,
  args: readonly string[],
  sidecar: string | undefined,
  maxPhpBytes: number = WP_EVAL_FILE_MAX_BYTES,
  maxSidecarBytes: number = WP_EVAL_SIDECAR_MAX_BYTES
): void {
  if (php.length === 0) {
    throw new SiteRunStepError(WP_EVAL_FILE_STEP, 'PHP body is empty.')
  }
  if (Buffer.byteLength(php, 'utf8') > maxPhpBytes) {
    throw new SiteRunStepError(WP_EVAL_FILE_STEP, `PHP body is over the ${maxPhpBytes}-byte cap.`)
  }
  if (sidecar !== undefined && Buffer.byteLength(sidecar, 'utf8') > maxSidecarBytes) {
    throw new SiteRunStepError(
      WP_EVAL_FILE_STEP,
      `JSON sidecar is over the ${maxSidecarBytes}-byte cap.`
    )
  }
  for (const argument of args) {
    const unsafe = wpCliArgLooksDangerous(argument)
    if (unsafe) {
      throw new SiteRunStepError(WP_EVAL_FILE_STEP, unsafe)
    }
  }
}

// WP-CLI includes a tagless body as plain text and still exits 0, which reads as success. A BOM
// ahead of the tag would reach stdout as three stray bytes, so it goes whether or not one is added.
const PHP_OPEN_TAG = /^\s*(?:<\?php|<\?=)/

export function withPhpOpenTag(body: string): string {
  const withoutBom = body.startsWith('\uFEFF') ? body.slice(1) : body
  return PHP_OPEN_TAG.test(withoutBom) ? withoutBom : `<?php\n${withoutBom}`
}

function clampTimeout(timeoutMs: number | undefined): number {
  const requested = timeoutMs && timeoutMs > 0 ? timeoutMs : WP_CLI_DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(requested, WP_EVAL_MIN_TIMEOUT_MS), WP_EVAL_MAX_TIMEOUT_MS)
}

function finish(
  command: string,
  result: { code: number; stdout: string; stderr: string },
  maxOutputChars: number = WP_CLI_MAX_OUTPUT_CHARS
): WpEvalFileResult {
  const stdout = result.stdout.slice(0, maxOutputChars)
  const stderr = result.stderr.slice(0, maxOutputChars)
  return {
    command,
    code: result.code,
    stdout,
    stderr,
    stdoutTruncated: stdout.length < result.stdout.length,
    stderrTruncated: stderr.length < result.stderr.length
  }
}

async function readOutputFile(file: string): Promise<string> {
  const info = await stat(file)
  if (info.size > WP_EVAL_OUTPUT_FILE_MAX_BYTES) {
    throw new SiteRunStepError(
      WP_EVAL_FILE_STEP,
      `Walker output file is over the ${WP_EVAL_OUTPUT_FILE_MAX_BYTES}-byte cap.`
    )
  }
  return readFile(file, 'utf8')
}

// No file means the walker had nothing to write; any other failure is worth saying out loud.
async function collectLocalOutputFile(jsonPath: string): Promise<string | undefined> {
  try {
    return await readOutputFile(`${jsonPath}.out`)
  } catch (error) {
    if (error instanceof SiteRunStepError) {
      throw error
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    const detail = error instanceof Error ? error.message : String(error)
    throw new SiteRunStepError(
      WP_EVAL_FILE_STEP,
      `Could not read the walker output file: ${detail}`
    )
  }
}

async function collectRemoteOutputFile(
  session: SiteSshSession,
  jsonPath: string
): Promise<string | undefined> {
  const localCopy = path.join(tmpdir(), `muster-eval-out-${randomUUID()}.json`)
  try {
    await session.download(`${jsonPath}.out`, localCopy)
  } catch {
    // The walker writes the file only in the modes that produce one, so a missing file is normal.
    return undefined
  } finally {
    await session.removeRemoteFile(`${jsonPath}.out`)
  }
  try {
    return await readOutputFile(localCopy)
  } finally {
    await unlink(localCopy).catch(() => undefined)
  }
}

/** Setup failures (no DDEV binary or project) become this step's error, not a crash. */
function asEvalStepError<T>(build: () => T): T {
  try {
    return build()
  } catch (error) {
    throw new SiteRunStepError(
      WP_EVAL_FILE_STEP,
      error instanceof Error ? error.message : String(error)
    )
  }
}

export async function runLocalWpEvalFile(
  request: WpEvalFileRequest & { wpDir: string; dbSocket?: string; localStack?: SiteLocalStack },
  resolveLocalWpEnv: LocalWpEnvResolver = (socketPath) =>
    buildLocalWpWpEnv(createLocalWpHost(), socketPath)
): Promise<WpEvalFileResult> {
  const extra = request.args ?? []
  assertEvalPayload(
    request.php,
    extra,
    request.sidecar,
    request.maxPhpBytes,
    request.maxSidecarBytes
  )
  const localStack = request.localStack ?? 'plain'
  const files = asEvalStepError(() => localEvalFiles(localStack, request.wpDir))
  const written: string[] = []
  const cliArgs = ['--no-color', 'eval-file', files.cliPhpPath]
  if (request.sidecar !== undefined) {
    cliArgs.push(files.cliJsonPath)
  }
  cliArgs.push(...extra)
  const prefix = localStack === 'ddev' ? ['ddev', WP_BINARY] : [WP_BINARY]
  const command = [...prefix, ...cliArgs].map(quoteShellArgument).join(' ')
  try {
    if (files.ownedDir) {
      await mkdir(files.ownedDir, { recursive: true, mode: 0o700 })
    }
    await writeFile(files.phpPath, request.php, { encoding: 'utf8', mode: 0o600 })
    written.push(files.phpPath)
    if (request.sidecar !== undefined) {
      await writeFile(files.jsonPath, request.sidecar, { encoding: 'utf8', mode: 0o600 })
      written.push(files.jsonPath)
    }
    const socketPath = request.dbSocket?.trim() ?? ''
    const localWpEnv = socketPath.length > 0 ? await resolveLocalWpEnv(socketPath) : null
    const spawn = asEvalStepError(() =>
      buildLocalWpCliSpawn({
        localStack,
        wpDir: request.wpDir,
        args: cliArgs,
        env: {
          ...(localWpEnv ?? process.env),
          WP_CLI_PHP_ARGS: '-d error_reporting=E_ERROR -d display_errors=0'
        }
      })
    )
    let result: StreamCommandResult
    try {
      result = await streamCommand(spawn.command, spawn.args, {
        cwd: spawn.cwd,
        env: spawn.env,
        timeoutMs: clampTimeout(request.timeoutMs),
        ...(request.signal ? { signal: request.signal } : {})
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SiteRunCancelledError()
      }
      const detail = error instanceof Error ? error.message : String(error)
      throw new SiteRunStepError(
        WP_EVAL_FILE_STEP,
        localStack === 'ddev'
          ? ddevWpCliSpawnError(spawn.cwd, detail)
          : `WP-CLI (\`wp\`) could not be run in ${request.wpDir}: ${detail}`
      )
    }
    const finished = finish(command, result, request.maxOutputChars)
    if (!request.collectOutputFile) {
      return finished
    }
    // The walker writes `<sidecar>.out` beside the sidecar; for DDEV that is ownedDir.
    written.push(`${files.jsonPath}.out`)
    const outputFileContents = await collectLocalOutputFile(files.jsonPath)
    return outputFileContents === undefined ? finished : { ...finished, outputFileContents }
  } finally {
    await Promise.all(written.map((file) => unlink(file).catch(() => undefined)))
    if (files.ownedDir) {
      // rmdir only removes an empty folder, so a concurrent run's files are left alone.
      await rmdir(files.ownedDir).catch(() => undefined)
    }
  }
}

export async function runRemoteWpEvalFile(
  session: SiteSshSession,
  request: WpEvalFileRequest & { webroot: string }
): Promise<WpEvalFileResult> {
  const extra = request.args ?? []
  assertEvalPayload(
    request.php,
    extra,
    request.sidecar,
    request.maxPhpBytes,
    request.maxSidecarBytes
  )
  const { phpName, jsonName } = evalFileNames()
  const phpPath = `/tmp/${phpName}`
  const jsonPath = `/tmp/${jsonName}`
  const written: string[] = []
  const cliArgs = ['eval-file', phpPath]
  if (request.sidecar !== undefined) {
    cliArgs.push(jsonPath)
  }
  cliArgs.push(...extra)
  const command = [
    'cd',
    quoteShellArgument(request.webroot.trim().replace(/\/+$/, '') || '.'),
    '&&',
    WP_BINARY,
    '--no-color',
    ...cliArgs.map(quoteShellArgument)
  ].join(' ')
  try {
    await session.writeSecureRemoteFile(phpPath, request.php)
    written.push(phpPath)
    if (request.sidecar !== undefined) {
      await session.writeSecureRemoteFile(jsonPath, request.sidecar)
      written.push(jsonPath)
    }
    const result = await session.exec(command, { timeoutMs: clampTimeout(request.timeoutMs) })
    const finished = finish(command, result, request.maxOutputChars)
    if (!request.collectOutputFile) {
      return finished
    }
    const outputFileContents = await collectRemoteOutputFile(session, jsonPath)
    return outputFileContents === undefined ? finished : { ...finished, outputFileContents }
  } finally {
    for (const remotePath of written) {
      await session.removeRemoteFile(remotePath)
    }
  }
}
