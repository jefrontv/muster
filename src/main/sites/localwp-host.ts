// The injected machine surface the LocalWP modules run against: child processes, Local's config
// files, and socket probes. Everything is behind this seam so the LocalWP logic is testable with
// no Local app, no MySQL, and no real filesystem.
//
// LocalWP is macOS-only by construction — it ships a macOS app bundle and keys a per-site MySQL
// Unix socket under ~/Library/Application Support/Local/run/<siteId>/mysql/mysqld.sock. Callers
// gate on isLocalWpSupported and return a structured "unsupported" answer elsewhere.

import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { streamCommand } from '../lib/stream-command'

// Pure path arithmetic, hoisted to shared/ so reading the layout costs none of the machinery above.
export { localWpWordPressRoot } from '../../shared/localwp-paths'

export const LOCALWP_UNSUPPORTED_PLATFORM = 'LocalWP integration is only available on macOS.'

/** Probes must be bounded: a wedged Local app must never hang the main process. */
export const LOCALWP_COMMAND_TIMEOUT_MS = 5_000
export const LOCALWP_PROBE_TIMEOUT_MS = 3_000

export type LocalWpCommandResult = { code: number; stdout: string; stderr: string }

export type LocalWpCommandRunner = (
  file: string,
  args: string[],
  options?: { timeoutMs?: number; cwd?: string; signal?: AbortSignal }
) => Promise<LocalWpCommandResult>

export type LocalWpHost = {
  platform: string
  homeDir: string
  run: LocalWpCommandRunner
  readTextFile: (filePath: string) => Promise<string | null>
  pathExists: (filePath: string) => Promise<boolean>
  listDirectory: (dirPath: string) => Promise<string[]>
  /** Resolves symlinks; returns the input unchanged when the path does not exist. */
  canonicalPath: (filePath: string) => Promise<string>
  isTcpPortOpen: (port: number, timeoutMs: number) => Promise<boolean>
  /** A live MySQL handshake. The socket file existing on disk is NOT readiness. */
  isMysqlSocketReady: (socketPath: string, timeoutMs: number) => Promise<boolean>
  sleep: (ms: number) => Promise<void>
  environment: Record<string, string | undefined>
}

// streamCommand rejects on spawn failure (a missing pgrep/lsof/local-cli). ocsites treated that as
// "not available" rather than an error, so collapse it to a nonzero exit — but keep aborts fatal so
// a cancelled run stops instead of silently continuing.
const runLocalWpCommand: LocalWpCommandRunner = async (file, args, options) => {
  try {
    const result = await streamCommand(file, args, {
      cwd: options?.cwd,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? LOCALWP_COMMAND_TIMEOUT_MS
    })
    return { code: result.code, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    return { code: -1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }
  }
}

function isTcpPortOpen(port: number, timeoutMs: number): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const socket = net.connect({ host: '127.0.0.1', port })
  const finish = (open: boolean): void => {
    socket.destroy()
    resolve(open)
  }
  socket.setTimeout(timeoutMs, () => finish(false))
  socket.once('connect', () => finish(true))
  socket.once('error', () => finish(false))
  return promise
}

// mysqld sends its handshake packet unprompted, so receiving any byte proves the server is past
// startup. Checking only for the socket file loses that race and surfaces as a spurious
// "Can't connect to local MySQL" during the import right after a site starts.
function isMysqlSocketReady(socketPath: string, timeoutMs: number): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const socket = net.connect({ path: socketPath })
  const finish = (ready: boolean): void => {
    socket.destroy()
    resolve(ready)
  }
  socket.setTimeout(timeoutMs, () => finish(false))
  socket.once('data', () => finish(true))
  socket.once('error', () => finish(false))
  socket.once('close', () => resolve(false))
  return promise
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

export function createLocalWpHost(overrides: Partial<LocalWpHost> = {}): LocalWpHost {
  return {
    platform: process.platform,
    homeDir: os.homedir(),
    run: runLocalWpCommand,
    readTextFile: async (filePath) => {
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
    listDirectory: async (dirPath) => {
      try {
        return await readdir(dirPath)
      } catch {
        return []
      }
    },
    canonicalPath: async (filePath) => {
      try {
        return await realpath(filePath)
      } catch {
        return filePath
      }
    },
    isTcpPortOpen,
    isMysqlSocketReady,
    sleep: delay,
    environment: process.env,
    ...overrides
  }
}

export function isLocalWpSupported(host: LocalWpHost): boolean {
  return host.platform === 'darwin'
}

export function localWpSupportDirectory(host: LocalWpHost): string {
  return path.join(host.homeDir, 'Library', 'Application Support', 'Local')
}

export function localWpSocketPath(host: LocalWpHost, siteId: string): string {
  return path.join(localWpSupportDirectory(host), 'run', siteId, 'mysql', 'mysqld.sock')
}

export function localWpServicesDirectory(host: LocalWpHost): string {
  return path.join(localWpSupportDirectory(host), 'lightning-services')
}

export async function readLocalWpJsonRecord(
  host: LocalWpHost,
  filePath: string
): Promise<Record<string, unknown> | null> {
  const raw = await host.readTextFile(filePath)
  if (raw === null) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}
