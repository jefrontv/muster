// The agent-local routes the import pipeline drives, typed. Each is a thin wrapper over
// requestWithDaemon: no retries beyond the daemon start, no interpretation beyond the shape.
//
// Version gate: `/db/import` has always existed; `/db/search-replace`, `/probe` and `/errors`
// arrived in 0.27.0. Read the version once per run (`readAgentLocalVersion`) and branch on it
// rather than probing for 404s mid-import.

import type { AgentLocalDaemonStatus } from '../../shared/site-stack-types'
import {
  AGENT_LOCAL_READ_TIMEOUT_MS,
  createAgentLocalHost,
  describeAgentLocalResponse,
  requestWithDaemon,
  type AgentLocalHost,
  type AgentLocalResponse
} from './agent-local-host'

export const AGENT_LOCAL_IMPORT_ROUTES_MIN_VERSION = '0.27.0'

/** A db/import can load a multi-GB dump; poll for as long as the run itself is allowed to live. */
const JOB_POLL_INTERVAL_MS = 1_000
/** The daemon blocks the request for the whole load when not async, so ask for a job instead. */
const JOB_START_TIMEOUT_MS = 30_000
const SEARCH_REPLACE_TIMEOUT_MS = 20 * 60_000
const PROBE_TIMEOUT_MS = 60_000

export type AgentLocalImportApiOptions = { host?: AgentLocalHost }

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key]
  return typeof value === 'string' ? value : ''
}

function readNumber(record: Record<string, unknown> | null, key: string): number {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export class AgentLocalImportError extends Error {}

function fail(response: AgentLocalResponse): never {
  throw new AgentLocalImportError(describeAgentLocalResponse(response))
}

/** `[major, minor, patch]`; anything unparseable is `[0, 0, 0]`, which fails every gate. */
export function parseAgentLocalVersion(version: string): [number, number, number] {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  if (!match) {
    return [0, 0, 0]
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function agentLocalVersionAtLeast(version: string, minimum: string): boolean {
  const have = parseAgentLocalVersion(version)
  const want = parseAgentLocalVersion(minimum)
  for (let index = 0; index < 3; index += 1) {
    if (have[index] !== want[index]) {
      return (have[index] ?? 0) > (want[index] ?? 0)
    }
  }
  return true
}

export type AgentLocalStatus = {
  version: string
  /** The binary on disk, which can be newer than the running daemon until it hands over. */
  installed: string
  update: { latest: string; available: boolean }
}

export async function readAgentLocalStatus(
  options: AgentLocalImportApiOptions = {}
): Promise<AgentLocalStatus> {
  const host = options.host ?? createAgentLocalHost()
  const response = await requestWithDaemon(host, 'GET', '/status', undefined, {
    timeoutMs: AGENT_LOCAL_READ_TIMEOUT_MS
  })
  if (!response.ok) {
    fail(response)
  }
  const data = asRecord(response.data)
  const update = asRecord(data?.update)
  return {
    version: readString(data, 'version'),
    installed: readString(data, 'installed'),
    update: { latest: readString(update, 'latest'), available: update?.available === true }
  }
}

export type AgentLocalJobProgress = { stage: string; detail: string }

/**
 * Load a dump into the site's database through the daemon, which takes its own pre-import
 * snapshot and, unless `keepUrls`, rewrites every host the dump's home/siteurl name to the site's
 * domain. Returns the daemon's one-line summary, which names the snapshot and the rewrite.
 *
 * The job cannot be interrupted from outside: an abort here stops polling and rejects, and the
 * daemon finishes the load on its own. The snapshot is what makes that recoverable.
 */
export async function importDatabaseViaDaemon(args: {
  slug: string
  dumpPath: string
  keepUrls: boolean
  signal?: AbortSignal
  onProgress?: (progress: AgentLocalJobProgress) => void
  options?: AgentLocalImportApiOptions
}): Promise<string> {
  const host = args.options?.host ?? createAgentLocalHost()
  const started = await requestWithDaemon(
    host,
    'POST',
    `/sites/${encodeURIComponent(args.slug)}/db/import?async=1`,
    { path: args.dumpPath, keep_urls: args.keepUrls },
    { timeoutMs: JOB_START_TIMEOUT_MS, signal: args.signal }
  )
  if (!started.ok) {
    fail(started)
  }
  const job = asRecord(started.data)
  const jobId = readString(job, 'id')
  if (jobId.length === 0) {
    // A daemon that ignored ?async=1 answered with the finished result instead of a job.
    return typeof started.data === 'string' ? started.data : 'Database imported.'
  }
  let reported = 0
  for (;;) {
    if (args.signal?.aborted) {
      throw new AgentLocalImportError(
        'Cancelled while agent-local was loading the database; the load finishes on its own and the pre-import snapshot is restorable with `agent-local db restore`.'
      )
    }
    await host.sleep(JOB_POLL_INTERVAL_MS)
    const polled = await host.request('GET', `/jobs/${encodeURIComponent(jobId)}`, undefined, {
      timeoutMs: AGENT_LOCAL_READ_TIMEOUT_MS
    })
    if (!polled.ok) {
      fail(polled)
    }
    const view = asRecord(polled.data)
    const steps = Array.isArray(view?.steps) ? view.steps : []
    for (const step of steps.slice(reported)) {
      const record = asRecord(step)
      args.onProgress?.({
        stage: readString(record, 'stage'),
        detail: readString(record, 'detail')
      })
    }
    reported = steps.length
    const status = readString(view, 'status')
    if (status === 'ok') {
      const result = view?.result
      return typeof result === 'string' ? result : 'Database imported.'
    }
    if (status === 'error') {
      throw new AgentLocalImportError(readString(view, 'error') || 'agent-local db import failed')
    }
  }
}

export type AgentLocalSearchReplaceReport = {
  total: number
  hits: { table: string; column: string; count: number }[]
  configPinsRewritten: boolean
}

/** Rewrite one host to another across the site's tables, with the site's own PHP. Never a dry run. */
export async function searchReplaceViaDaemon(args: {
  slug: string
  from: string
  to: string
  signal?: AbortSignal
  options?: AgentLocalImportApiOptions
}): Promise<AgentLocalSearchReplaceReport> {
  const host = args.options?.host ?? createAgentLocalHost()
  const response = await requestWithDaemon(
    host,
    'POST',
    `/sites/${encodeURIComponent(args.slug)}/db/search-replace`,
    // dry_run defaults to TRUE on the daemon; this is the one place it must be explicit.
    { old: args.from, new: args.to, dry_run: false },
    { timeoutMs: SEARCH_REPLACE_TIMEOUT_MS, signal: args.signal }
  )
  if (!response.ok) {
    fail(response)
  }
  const data = asRecord(response.data)
  const hits = Array.isArray(data?.hits) ? data.hits : []
  return {
    total: readNumber(data, 'total'),
    hits: hits
      .map((hit) => asRecord(hit))
      .filter((hit): hit is Record<string, unknown> => hit !== null)
      .map((hit) => ({
        table: readString(hit, 'table'),
        column: readString(hit, 'column'),
        count: readNumber(hit, 'count')
      })),
    configPinsRewritten: data?.config_pins_rewritten === true
  }
}

export type AgentLocalProbeVerdict =
  | 'healthy'
  | 'slow'
  | 'redirects_offsite'
  | 'fatal'
  | 'blank'
  | 'down'
  | 'error'
  | 'asset_404'

export type AgentLocalProbe = { verdict: AgentLocalProbeVerdict | string; reason: string }

/** Ask the running site whether it actually works: one word plus the reason. */
export async function probeSiteViaDaemon(args: {
  slug: string
  signal?: AbortSignal
  options?: AgentLocalImportApiOptions
}): Promise<AgentLocalProbe> {
  const host = args.options?.host ?? createAgentLocalHost()
  const response = await requestWithDaemon(
    host,
    'POST',
    `/sites/${encodeURIComponent(args.slug)}/probe`,
    undefined,
    { timeoutMs: PROBE_TIMEOUT_MS, signal: args.signal }
  )
  if (!response.ok) {
    fail(response)
  }
  const data = asRecord(response.data)
  return { verdict: readString(data, 'verdict') || 'error', reason: readString(data, 'reason') }
}

export type AgentLocalErrorEntry = { level: string; message: string; file: string; line: number }

export async function readRecentSiteErrors(args: {
  slug: string
  limit?: number
  options?: AgentLocalImportApiOptions
}): Promise<AgentLocalErrorEntry[]> {
  const host = args.options?.host ?? createAgentLocalHost()
  const response = await requestWithDaemon(
    host,
    'GET',
    `/sites/${encodeURIComponent(args.slug)}/errors?since=5m&limit=${args.limit ?? 5}`,
    undefined,
    { timeoutMs: AGENT_LOCAL_READ_TIMEOUT_MS }
  )
  if (!response.ok) {
    return []
  }
  const data = asRecord(response.data)
  const entries = Array.isArray(data?.entries) ? data.entries : []
  return entries
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({
      level: readString(entry, 'level'),
      message: readString(entry, 'message'),
      file: readString(entry, 'file'),
      line: readNumber(entry, 'line')
    }))
}

/**
 * The daemon's version and update state shaped for the stack panel. A daemon that is not up
 * answers with empty strings rather than an error: the panel shows nothing, not a failure.
 */
export async function readAgentLocalDaemonStatus(
  options: AgentLocalImportApiOptions = {}
): Promise<AgentLocalDaemonStatus> {
  try {
    const status = await readAgentLocalStatus(options)
    return {
      version: status.version,
      installed: status.installed,
      updateAvailable: status.update.available,
      latest: status.update.latest,
      importRoutes: agentLocalVersionAtLeast(status.version, AGENT_LOCAL_IMPORT_ROUTES_MIN_VERSION)
    }
  } catch {
    return { version: '', installed: '', updateAvailable: false, latest: '', importRoutes: false }
  }
}
