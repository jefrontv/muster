// wp eval-file with a temp file we own and always delete.
//
// Bypasses checkWpCliSafety on purpose: the banned verbs are the point. Callers either pass our
// bundled ACF runner or a size-capped agent body. Extra argv still go through wpCliArgLooksDangerous
// and quoteShellArgument so nothing on the remote command line can break out of a token.

import { randomUUID } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { streamCommand, type StreamCommandResult } from '../lib/stream-command'
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
}

export type WpEvalFileRequest = {
  php: string
  args?: readonly string[]
  sidecar?: string
  maxPhpBytes?: number
  maxOutputChars?: number
  timeoutMs?: number
  signal?: AbortSignal
}

function assertEvalPayload(
  php: string,
  args: readonly string[],
  sidecar: string | undefined,
  maxPhpBytes: number = WP_EVAL_FILE_MAX_BYTES
): void {
  if (php.length === 0) {
    throw new SiteRunStepError(WP_EVAL_FILE_STEP, 'PHP body is empty.')
  }
  if (Buffer.byteLength(php, 'utf8') > maxPhpBytes) {
    throw new SiteRunStepError(WP_EVAL_FILE_STEP, `PHP body is over the ${maxPhpBytes}-byte cap.`)
  }
  if (sidecar !== undefined && Buffer.byteLength(sidecar, 'utf8') > WP_EVAL_SIDECAR_MAX_BYTES) {
    throw new SiteRunStepError(
      WP_EVAL_FILE_STEP,
      `JSON sidecar is over the ${WP_EVAL_SIDECAR_MAX_BYTES}-byte cap.`
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

function evalFileNames(): { phpName: string; jsonName: string } {
  const id = randomUUID()
  return { phpName: `muster-eval-${id}.php`, jsonName: `muster-eval-${id}.json` }
}

export async function runLocalWpEvalFile(
  request: WpEvalFileRequest & { wpDir: string; dbSocket?: string },
  resolveLocalWpEnv: LocalWpEnvResolver = (socketPath) =>
    buildLocalWpWpEnv(createLocalWpHost(), socketPath)
): Promise<WpEvalFileResult> {
  const extra = request.args ?? []
  assertEvalPayload(request.php, extra, request.sidecar, request.maxPhpBytes)
  const { phpName, jsonName } = evalFileNames()
  const phpPath = path.join(tmpdir(), phpName)
  const jsonPath = path.join(tmpdir(), jsonName)
  const written: string[] = []
  const spawnArgs = ['--no-color', 'eval-file', phpPath]
  if (request.sidecar !== undefined) {
    spawnArgs.push(jsonPath)
  }
  spawnArgs.push(...extra)
  const command = [WP_BINARY, ...spawnArgs].map(quoteShellArgument).join(' ')
  try {
    await writeFile(phpPath, request.php, { encoding: 'utf8', mode: 0o600 })
    written.push(phpPath)
    if (request.sidecar !== undefined) {
      await writeFile(jsonPath, request.sidecar, { encoding: 'utf8', mode: 0o600 })
      written.push(jsonPath)
    }
    const socketPath = request.dbSocket?.trim() ?? ''
    const localWpEnv = socketPath.length > 0 ? await resolveLocalWpEnv(socketPath) : null
    let result: StreamCommandResult
    try {
      result = await streamCommand(WP_BINARY, spawnArgs, {
        cwd: request.wpDir,
        env: {
          ...(localWpEnv ?? process.env),
          WP_CLI_PHP_ARGS: '-d error_reporting=E_ERROR -d display_errors=0'
        },
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
        `WP-CLI (\`wp\`) could not be run in ${request.wpDir}: ${detail}`
      )
    }
    return finish(command, result, request.maxOutputChars)
  } finally {
    await Promise.all(written.map((file) => unlink(file).catch(() => undefined)))
  }
}

export async function runRemoteWpEvalFile(
  session: SiteSshSession,
  request: WpEvalFileRequest & { webroot: string }
): Promise<WpEvalFileResult> {
  const extra = request.args ?? []
  assertEvalPayload(request.php, extra, request.sidecar, request.maxPhpBytes)
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
    return finish(command, result, request.maxOutputChars)
  } finally {
    for (const remotePath of written) {
      await session.removeRemoteFile(remotePath)
    }
  }
}
