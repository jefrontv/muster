// Routes MCP site writes through the running GUI, and writes the data file directly only when no
// GUI is running.
//
// Which case applies is decided by the transport, never by a failed write: a GUI that is up but
// slow or refusing must not be written around. That fallback reported ok:true while the GUI's
// next whole-state save put the old value back.

import { readFileSync } from 'node:fs'
import type { Site, SiteCustomStep } from '../../../shared/site-types'
import type { SiteEnvironmentPatches } from '../site-environment-patches'
import type { SiteWriteBridgeEndpoint } from '../site-write-bridge-server'

const BRIDGE_REQUEST_TIMEOUT_MS = 5_000

export type SiteBridgeOutcome<T> =
  | { kind: 'applied'; value: T }
  /** Nothing is listening: no endpoint file, a dead pid, or a refused connection. */
  | { kind: 'no-gui' }
  /** The GUI is up and did not apply it: a timeout, an error, or a refusal it explained. */
  | { kind: 'refused'; detail: string }

export type SiteWriteBridgeBody = {
  siteId: string
  updates: Partial<Omit<Site, 'id'>>
  environmentPatches?: SiteEnvironmentPatches
}

export type SiteWriteBridgeTransport = {
  readEndpoint: () => SiteWriteBridgeEndpoint | null
  post: (
    endpoint: SiteWriteBridgeEndpoint,
    body: SiteWriteBridgeBody
  ) => Promise<SiteBridgeOutcome<Site>>
}

export class SiteBridgeRefusedError extends Error {}

function refusedError(detail: string): SiteBridgeRefusedError {
  return new SiteBridgeRefusedError(
    `Muster is open but did not save the change (${detail}). Nothing was written; try again.`
  )
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: alive, owned by someone else. ESRCH: gone.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function readEndpointFile(bridgeFile: string): SiteWriteBridgeEndpoint | null {
  try {
    const parsed = JSON.parse(readFileSync(bridgeFile, 'utf-8')) as Partial<SiteWriteBridgeEndpoint>
    if (typeof parsed.port !== 'number' || typeof parsed.token !== 'string' || parsed.port <= 0) {
      return null
    }
    const pid = parsed.pid ?? 0
    // A GUI that crashed leaves its endpoint file behind.
    if (pid > 0 && !processAlive(pid)) {
      return null
    }
    return { port: parsed.port, token: parsed.token, pid }
  } catch {
    // Missing or half-written: no GUI.
    return null
  }
}

function isConnectionRefused(error: unknown): boolean {
  const code = (error as { cause?: { code?: string } } | null)?.cause?.code
  return code === 'ECONNREFUSED'
}

export async function requestBridge(
  endpoint: SiteWriteBridgeEndpoint,
  route: string,
  body: unknown
): Promise<SiteBridgeOutcome<Record<string, unknown>>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BRIDGE_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`http://127.0.0.1:${endpoint.port}${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-muster-site-bridge-token': endpoint.token
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const text = await response.text().catch(() => '')
    let payload: Record<string, unknown> = {}
    try {
      payload = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      payload = {}
    }
    if (!response.ok) {
      const reason = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`
      return { kind: 'refused', detail: reason }
    }
    return { kind: 'applied', value: payload }
  } catch (error) {
    if (isConnectionRefused(error)) {
      return { kind: 'no-gui' }
    }
    if (controller.signal.aborted) {
      return { kind: 'refused', detail: `no answer within ${BRIDGE_REQUEST_TIMEOUT_MS / 1000} s` }
    }
    return { kind: 'refused', detail: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeout)
  }
}

async function postSiteUpdate(
  endpoint: SiteWriteBridgeEndpoint,
  body: SiteWriteBridgeBody
): Promise<SiteBridgeOutcome<Site>> {
  const outcome = await requestBridge(endpoint, '/site/update', body)
  if (outcome.kind !== 'applied') {
    return outcome
  }
  const site = outcome.value.site
  return site && typeof site === 'object'
    ? { kind: 'applied', value: site as Site }
    : { kind: 'refused', detail: 'the reply carried no site' }
}

/**
 * Applies a site write through the GUI when one is running, else through `writeLocally`, which
 * patches the data file. Throws SiteBridgeRefusedError when the GUI is up and did not apply it.
 */
export async function updateSiteThroughBridge(
  args: SiteWriteBridgeBody & { bridgeFile: string },
  writeLocally: (body: SiteWriteBridgeBody) => Site | null,
  transport?: SiteWriteBridgeTransport
): Promise<Site | null> {
  const resolved: SiteWriteBridgeTransport = transport ?? {
    readEndpoint: () => readEndpointFile(args.bridgeFile),
    post: postSiteUpdate
  }
  const { bridgeFile: _bridgeFile, ...body } = args
  const endpoint = resolved.readEndpoint()
  if (!endpoint) {
    return writeLocally(body)
  }
  const outcome = await resolved.post(endpoint, body)
  if (outcome.kind === 'applied') {
    return outcome.value
  }
  if (outcome.kind === 'no-gui') {
    return writeLocally(body)
  }
  throw refusedError(outcome.detail)
}

/** The library twin of updateSiteThroughBridge, with the same no-GUI rule. */
export async function setStepLibraryThroughBridge(
  args: { steps: readonly SiteCustomStep[]; bridgeFile: string },
  writeLocally: (steps: readonly SiteCustomStep[]) => void,
  transport?: {
    readEndpoint?: () => SiteWriteBridgeEndpoint | null
    postLibrary?: (
      endpoint: SiteWriteBridgeEndpoint,
      steps: readonly SiteCustomStep[]
    ) => Promise<SiteBridgeOutcome<unknown>>
  }
): Promise<void> {
  const readEndpoint = transport?.readEndpoint ?? (() => readEndpointFile(args.bridgeFile))
  const post =
    transport?.postLibrary ??
    ((endpoint, steps) => requestBridge(endpoint, '/library/update', { steps }))
  const endpoint = readEndpoint()
  const outcome = endpoint ? await post(endpoint, args.steps) : ({ kind: 'no-gui' } as const)
  if (outcome.kind === 'applied') {
    return
  }
  if (outcome.kind === 'no-gui') {
    writeLocally(args.steps)
    return
  }
  throw refusedError(outcome.detail)
}

/**
 * Stored passwords are encrypted with the OS keychain, which only the GUI process can reach.
 * Returns false when no GUI is running, so the caller can try its own (usually unavailable) copy.
 */
export async function changeSecretsThroughBridge(
  args: {
    bridgeFile: string
    siteId: string
    copy?: { from: string; to: string }
    remove?: string
  },
  transport?: {
    readEndpoint?: () => SiteWriteBridgeEndpoint | null
    post?: (
      endpoint: SiteWriteBridgeEndpoint,
      body: Record<string, unknown>
    ) => Promise<SiteBridgeOutcome<unknown>>
  }
): Promise<boolean> {
  const readEndpoint = transport?.readEndpoint ?? (() => readEndpointFile(args.bridgeFile))
  const post =
    transport?.post ?? ((endpoint, body) => requestBridge(endpoint, '/site/secrets', body))
  const endpoint = readEndpoint()
  if (!endpoint) {
    return false
  }
  const { bridgeFile: _bridgeFile, ...body } = args
  const outcome = await post(endpoint, body)
  if (outcome.kind === 'applied') {
    return true
  }
  if (outcome.kind === 'no-gui') {
    return false
  }
  throw refusedError(outcome.detail)
}
