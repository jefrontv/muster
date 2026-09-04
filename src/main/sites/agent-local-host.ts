// The injected machine surface the agent-local modules run against: the control API, the token
// file, and the daemon spawn. Everything is behind this seam so the agent-local logic is testable
// with no daemon, no MariaDB, and no real filesystem — the same shape as localwp-host.ts.
//
// agent-local is a macOS Go binary, so callers gate on isAgentLocalSupported and return a
// structured "unsupported" answer rather than throwing on Linux and Windows.

import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { streamCommand } from '../lib/stream-command'
import { cancelUnreadResponseBody } from '../lib/unread-response-body'

export const AGENT_LOCAL_UNSUPPORTED_PLATFORM = 'Agent Local is only available on macOS.'

export const AGENT_LOCAL_API_ORIGIN = 'http://127.0.0.1:10809'

/** The one MariaDB every agent-local site shares; per-site isolation is by schema and user. */
export const AGENT_LOCAL_DATABASE_PORT = 10360

/** Reads must be bounded: a wedged daemon must never hang the main process. */
export const AGENT_LOCAL_READ_TIMEOUT_MS = 5_000
/** A cold start boots PHP-FPM and MariaDB. */
export const AGENT_LOCAL_START_TIMEOUT_MS = 60_000
/** How long to wait for a daemon we just spawned to answer /status. */
export const AGENT_LOCAL_DAEMON_WAIT_MS = 10_000
/** restart-daemon waits for the API itself, so this only guards against a hung launchctl. */
export const AGENT_LOCAL_RESTART_TIMEOUT_MS = 60_000

export type AgentLocalSpawnOutcome =
  | { kind: 'started' }
  | { kind: 'not-installed' }
  | { kind: 'failed'; detail: string }
const DAEMON_POLL_INTERVAL_MS = 250

export type AgentLocalResponse = {
  ok: boolean
  status: number
  data?: unknown
  error?: string
}

export type AgentLocalRequestOptions = { timeoutMs?: number; signal?: AbortSignal }

export type AgentLocalHost = {
  platform: string
  homeDir: string
  /** The API token; null when agent-local has never run and the file does not exist yet. */
  readToken: () => Promise<string | null>
  request: (
    method: string,
    apiPath: string,
    body?: unknown,
    options?: AgentLocalRequestOptions
  ) => Promise<AgentLocalResponse>
  /**
   * Bring the daemon up under launchd via `agent-local restart-daemon`, which waits for the API
   * itself. `not-installed` is the binary missing from PATH; `failed` is anything else it said.
   */
  spawnDaemon: () => Promise<AgentLocalSpawnOutcome>
  sleep: (ms: number) => Promise<void>
}

/**
 * Every site payload carries the site's MariaDB password in cleartext, and `GET /sites` carries one
 * for every site at once. Nothing derived from a response may reach a log, an error message or a
 * crash report until it has been through here.
 */
const SECRET_KEYS = new Set(['db_pass', 'pass', 'password', 'admin_pass'])

export function redactAgentLocalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactAgentLocalValue)
  }
  if (typeof value !== 'object' || value === null) {
    return value
  }
  const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) =>
    SECRET_KEYS.has(key) && typeof item === 'string' && item.length > 0
      ? [key, '[redacted]']
      : [key, redactAgentLocalValue(item)]
  )
  return Object.fromEntries(entries)
}

/** The only safe way to render a response for a human. */
export function describeAgentLocalResponse(response: AgentLocalResponse): string {
  if (response.error) {
    return response.error
  }
  return JSON.stringify(redactAgentLocalValue(response.data ?? null))
}

export function agentLocalTokenPath(host: Pick<AgentLocalHost, 'homeDir'>): string {
  return path.join(host.homeDir, '.agent-local', 'token')
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

// A connection refusal is "the daemon is not up", which is a normal first state and never an error
// the caller should surface. Every other failure keeps its message so a wrong token or a 500 is
// distinguishable from a dead socket.
function isConnectionRefusal(error: unknown): boolean {
  const code = (error as { cause?: { code?: string }; code?: string } | null)?.cause?.code
  return code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ENOTFOUND'
}

export const AGENT_LOCAL_DAEMON_DOWN = 'agent-local daemon is not running'
/** The binary is not on PATH: nothing Muster can restart. */
export const AGENT_LOCAL_NOT_INSTALLED = 'Agent Local is not installed.'
/** restart-daemon ran and the API still did not answer: a crash or a broken launchd job. */
export const AGENT_LOCAL_DAEMON_UNREACHABLE =
  'Agent Local did not come back after a restart. Run `agent-local doctor` in a terminal.'

function safeParseJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

async function requestAgentLocal(
  host: Pick<AgentLocalHost, 'readToken'>,
  method: string,
  apiPath: string,
  body?: unknown,
  options?: AgentLocalRequestOptions
): Promise<AgentLocalResponse> {
  const token = await host.readToken()
  if (token === null) {
    // The binary name stays literal here — it is what the user has to run.
    return { ok: false, status: 0, error: 'Agent Local has no API token; run `agent-local` once.' }
  }
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? AGENT_LOCAL_READ_TIMEOUT_MS
  )
  const abortOuter = (): void => controller.abort()
  options?.signal?.addEventListener('abort', abortOuter)
  try {
    const response = await fetch(`${AGENT_LOCAL_API_ORIGIN}${apiPath}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    // Read the body on every path, !ok included: leaving it unread can crash the process from
    // inside undici (orca#8695). `.text()` always drains; only the parse is allowed to fail.
    // Named for the response, not `body` — that is this function's request parameter, and shadowing
    // it puts the `fetch` call above in the temporal dead zone of the const below.
    const responseBody = await response.text().catch(async () => {
      await cancelUnreadResponseBody(response)
      return ''
    })
    const payload: unknown = responseBody.length > 0 ? safeParseJson(responseBody) : null
    const envelope = (payload ?? {}) as { ok?: unknown; data?: unknown; error?: unknown }
    return {
      // The envelope is authoritative when present; a bare non-2xx with no body is still a failure.
      ok: typeof envelope.ok === 'boolean' ? envelope.ok : response.ok,
      status: response.status,
      data: envelope.data,
      error: typeof envelope.error === 'string' ? envelope.error : undefined
    }
  } catch (error) {
    if (isConnectionRefusal(error)) {
      return { ok: false, status: 0, error: AGENT_LOCAL_DAEMON_DOWN }
    }
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error)
    }
  } finally {
    clearTimeout(timeout)
    options?.signal?.removeEventListener('abort', abortOuter)
  }
}

export function createAgentLocalHost(overrides: Partial<AgentLocalHost> = {}): AgentLocalHost {
  const homeDir = overrides.homeDir ?? os.homedir()
  const host: AgentLocalHost = {
    platform: process.platform,
    homeDir,
    readToken: async () => {
      try {
        const token = (await readFile(agentLocalTokenPath({ homeDir }), 'utf8')).trim()
        return token.length > 0 ? token : null
      } catch {
        return null
      }
    },
    request: (method, apiPath, body, options) =>
      requestAgentLocal(host, method, apiPath, body, options),
    spawnDaemon: async () => {
      // `restart-daemon`, not `daemon --background`: the latter forked a daemon OUTSIDE launchd,
      // which inherits Muster's folder grants (static files 403) and can never hand itself over on
      // update. restart-daemon kickstarts the launchd job, loading it first if needed, and returns
      // once the API answers - so the wait here is the command's own.
      try {
        const result = await streamCommand('agent-local', ['restart-daemon'], {
          timeoutMs: AGENT_LOCAL_RESTART_TIMEOUT_MS
        })
        if (result.code === 0) {
          return { kind: 'started' }
        }
        return {
          kind: 'failed',
          detail: (result.stderr.trim() || result.stdout.trim()).split('\n').at(-1) ?? ''
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          return { kind: 'not-installed' }
        }
        return { kind: 'failed', detail: error instanceof Error ? error.message : String(error) }
      }
    },
    sleep: delay,
    ...overrides
  }
  return host
}

export function isAgentLocalSupported(host: Pick<AgentLocalHost, 'platform'>): boolean {
  return host.platform === 'darwin'
}

/**
 * A request that treats "daemon down" as a state to fix rather than an error: spawn once, poll
 * /status until it answers, then retry the original call exactly once.
 */
export async function requestWithDaemon(
  host: AgentLocalHost,
  method: string,
  apiPath: string,
  body?: unknown,
  options?: AgentLocalRequestOptions
): Promise<AgentLocalResponse> {
  const first = await host.request(method, apiPath, body, options)
  if (first.error !== AGENT_LOCAL_DAEMON_DOWN) {
    return first
  }
  const spawned = await host.spawnDaemon()
  if (spawned.kind === 'not-installed') {
    return { ok: false, status: 0, error: AGENT_LOCAL_NOT_INSTALLED }
  }
  const deadline = AGENT_LOCAL_DAEMON_WAIT_MS / DAEMON_POLL_INTERVAL_MS
  for (let attempt = 0; attempt < deadline; attempt += 1) {
    await host.sleep(DAEMON_POLL_INTERVAL_MS)
    const status = await host.request('GET', '/status', undefined, options)
    if (status.error !== AGENT_LOCAL_DAEMON_DOWN) {
      return host.request(method, apiPath, body, options)
    }
  }
  // Not the original "not running": that was true before the restart and reads as "start it".
  const detail =
    spawned.kind === 'failed' && spawned.detail.length > 0 ? ` (${spawned.detail})` : ''
  return { ok: false, status: 0, error: `${AGENT_LOCAL_DAEMON_UNREACHABLE}${detail}` }
}

/** True for every "the daemon is not there" answer, whatever the reason. */
export function isAgentLocalDaemonDown(response: AgentLocalResponse): boolean {
  return (
    response.error === AGENT_LOCAL_DAEMON_DOWN ||
    response.error === AGENT_LOCAL_NOT_INSTALLED ||
    (response.error?.startsWith(AGENT_LOCAL_DAEMON_UNREACHABLE) ?? false)
  )
}
