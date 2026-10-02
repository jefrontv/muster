// The machine surface for DDEV: its CLI, the Docker it drives, and the project files on disk.
//
// Two things shape everything here:
//
// 1. A GUI app inherits launchd's PATH, which lacks Homebrew. `ddev` itself shells out to `docker`
//    and `mkcert`, so finding `ddev` is not enough: the child's PATH has to carry their folders too.
// 2. `ddev … -j` prints one JSON object per line and the payload is the last one, but a Docker that
//    is down produces plain coloured text and no JSON at all. Both shapes become one plain message.

import { readFile, stat } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { homedir } from 'node:os'
import path from 'node:path'
import { probeBinary } from '../extensions/binary-probe'
import { streamCommand, type StreamCommandResult } from '../lib/stream-command'

export type DdevTool = 'ddev' | 'docker' | 'colima' | 'mkcert'

export type DdevRunOptions = {
  cwd?: string
  timeoutMs?: number
  onLine?: (line: string) => void
}

export type DdevHost = {
  platform: NodeJS.Platform
  homeDir: string
  findBinary: (tool: DdevTool) => string | null
  run: (
    command: string,
    args: readonly string[],
    options?: DdevRunOptions
  ) => Promise<StreamCommandResult>
  readText: (filePath: string) => Promise<string | null>
  pathExists: (filePath: string) => Promise<boolean>
  sleep: (ms: number) => Promise<void>
  /** A TCP connect, so a start that "succeeded" but serves nothing is caught. */
  canConnect: (address: string, port: number) => Promise<boolean>
}

/** A `describe` or `list` answers in about a second; anything past this is a wedged Docker. */
export const DDEV_READ_TIMEOUT_MS = 30_000
/** A cold `ddev start` pulls and builds images on first use; ten minutes covers a slow network. */
export const DDEV_START_TIMEOUT_MS = 10 * 60_000

export const DDEV_NOT_INSTALLED = 'DDEV is not installed. Install it from ddev.com, then retry.'
export const DOCKER_NOT_RUNNING =
  'Docker is not running. Start Docker Desktop, OrbStack or Colima, then press Start again.'

// eslint-disable-next-line no-control-regex -- ANSI colour codes in DDEV's plain-text errors
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '')
}

/** Folders the found tools live in, ahead of the inherited PATH, so `ddev` finds `docker`. */
function childPath(host: Pick<DdevHost, 'findBinary'>): string {
  const directories = new Set<string>()
  for (const tool of ['ddev', 'docker', 'mkcert', 'colima'] as const) {
    const found = host.findBinary(tool)
    if (found) {
      directories.add(path.dirname(found))
    }
  }
  return [...directories, process.env.PATH ?? ''].filter(Boolean).join(path.delimiter)
}

export function createDdevHost(overrides: Partial<DdevHost> = {}): DdevHost {
  const host: DdevHost = {
    platform: process.platform,
    homeDir: homedir(),
    findBinary: (tool) => probeBinary(tool).path,
    run: (command, args, options = {}) => {
      let pending = ''
      return streamCommand(command, [...args], {
        ...(options.cwd ? { cwd: options.cwd } : {}),
        env: { ...process.env, PATH: childPath(host) },
        timeoutMs: options.timeoutMs ?? DDEV_READ_TIMEOUT_MS,
        ...(options.onLine
          ? {
              onStdout: (chunk: string) => {
                pending += chunk
                const lines = pending.split('\n')
                pending = lines.pop() ?? ''
                for (const line of lines) {
                  const clean = stripAnsi(line).trim()
                  if (clean) {
                    options.onLine?.(clean)
                  }
                }
              }
            }
          : {})
      })
    },
    readText: async (filePath) => {
      try {
        return await readFile(filePath, 'utf8')
      } catch {
        return null
      }
    },
    pathExists: async (filePath) => {
      try {
        await stat(filePath)
        return true
      } catch {
        return false
      }
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    canConnect: (address, port) =>
      new Promise((resolve) => {
        const socket = createConnection({ host: address, port, timeout: 1_500 })
        const finish = (ok: boolean): void => {
          socket.destroy()
          resolve(ok)
        }
        socket.once('connect', () => finish(true))
        socket.once('timeout', () => finish(false))
        socket.once('error', () => finish(false))
      }),
    ...overrides
  }
  return host
}

/** One line that says what to do, from either a JSON `msg` or DDEV's plain-text output. */
export function ddevPlainError(text: string): string {
  const clean = stripAnsi(text).trim()
  if (/docker provider|cannot connect to the docker daemon|docker is not running/i.test(clean)) {
    return DOCKER_NOT_RUNNING
  }
  if (/port .*(already|in use)|address already in use|bind: /i.test(clean)) {
    return `${clean.split('\n')[0]} Another local server (often LocalWP) may hold that port.`
  }
  return clean.split('\n').find((line) => line.trim().length > 0) ?? 'DDEV did not answer.'
}

export class DdevCommandError extends Error {}

type DdevJsonLine = { level?: unknown; msg?: unknown; raw?: unknown }

function lastJsonLine(output: string): DdevJsonLine | null {
  let last: DdevJsonLine | null = null
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) {
      continue
    }
    try {
      last = JSON.parse(trimmed) as DdevJsonLine
    } catch {
      // A partial line from a killed child; the earlier complete one still counts.
    }
  }
  return last
}

/** Runs `ddev <args> -j` and returns the last line's `raw` payload. */
export async function runDdevJson(
  host: DdevHost,
  args: readonly string[],
  options: DdevRunOptions = {}
): Promise<unknown> {
  const ddev = host.findBinary('ddev')
  if (!ddev) {
    throw new DdevCommandError(DDEV_NOT_INSTALLED)
  }
  const result = await host.run(ddev, [...args, '-j'], options)
  const last = lastJsonLine(`${result.stdout}\n${result.stderr}`)
  if (result.timedOut) {
    throw new DdevCommandError(
      `DDEV did not answer within ${Math.round((options.timeoutMs ?? DDEV_READ_TIMEOUT_MS) / 1000)} s.`
    )
  }
  if (!last) {
    throw new DdevCommandError(ddevPlainError(`${result.stderr}\n${result.stdout}`))
  }
  if (last.level === 'fatal' || last.level === 'error') {
    throw new DdevCommandError(ddevPlainError(String(last.msg ?? '')))
  }
  return last.raw ?? null
}

/** The line of DDEV output most likely to say what went wrong, colour codes stripped. */
export function ddevOutputSummary(text: string): string {
  const lines = stripAnsi(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return (
    lines.find((line) => /fail|error|unable|cannot|denied|in use/i.test(line)) ?? lines.at(-1) ?? ''
  )
}
