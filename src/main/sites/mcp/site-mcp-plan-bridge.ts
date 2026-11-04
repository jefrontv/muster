// MCP-process client for the plan-review routes on the site write bridge.
//
// Separate from site-mcp-store-bridge.ts for one reason: that client aborts at 5s, which is right
// for a site write and wrong here. Opening a review is fast, but collecting the verdict parks for
// as long as the caller asks, so neither call can share the store client's clock.
//
// There is also no fallback. A site write can land on disk with no GUI running; "ask a person"
// cannot, so a missing bridge is a hard, explanatory failure rather than a silent degrade.

import { readFileSync } from 'node:fs'
import type {
  PlanAnnotationOpenInput,
  PlanAnnotationResult
} from '../../../shared/plan-annotation-types'
import type { SiteWriteBridgeEndpoint } from '../site-write-bridge-server'

export type PlanBridgeRequest = PlanAnnotationOpenInput

export class PlanBridgeUnavailableError extends Error {}

function readEndpointFile(bridgeFile: string): SiteWriteBridgeEndpoint | null {
  try {
    const parsed = JSON.parse(readFileSync(bridgeFile, 'utf-8')) as Partial<SiteWriteBridgeEndpoint>
    if (typeof parsed.port !== 'number' || typeof parsed.token !== 'string') {
      return null
    }
    return { port: parsed.port, token: parsed.token, pid: parsed.pid ?? 0 }
  } catch {
    // Missing or half-written: treat as no GUI.
    return null
  }
}

const NO_GUI =
  'No Muster window is running, so there is nobody to review the plan. Open Muster and try again.'

const LOST_CONTACT =
  'Muster did not answer this request in time. Nothing was lost: call the same tool again with the same id.'

/** Only a refused connection means nothing is listening; a dropped or slow one is a live Muster. */
function connectionRefused(error: unknown): boolean {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause
  return cause?.code === 'ECONNREFUSED'
}

export type PlanReviewOutcome =
  | { status: 'settled'; result: PlanAnnotationResult }
  // shownMs and queuedAhead are absent from an older Muster.
  | { status: 'pending'; openedMs: number; shownMs?: number | null; queuedAhead?: number }
  | { status: 'unknown' }

/** POSTs to a GUI-only bridge route. `noGui` is the message when no window can answer. */
export async function postToGuiBridge(args: {
  bridgeFile: string
  path: string
  body: unknown
  fetchImpl?: typeof fetch
  noGui?: string
  refusedLabel?: string
}): Promise<unknown> {
  const noGui = args.noGui ?? NO_GUI
  const endpoint = readEndpointFile(args.bridgeFile)
  if (!endpoint) {
    throw new PlanBridgeUnavailableError(noGui)
  }
  const doFetch = args.fetchImpl ?? fetch
  let response: Response
  try {
    response = await doFetch(`http://127.0.0.1:${endpoint.port}${args.path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-muster-site-bridge-token': endpoint.token
      },
      body: JSON.stringify(args.body)
    })
  } catch (error) {
    // A stale endpoint file pointing at a dead port reads the same as no GUI to the caller.
    throw new PlanBridgeUnavailableError(connectionRefused(error) ? noGui : LOST_CONTACT)
  }
  if (!response.ok) {
    // Pass the route's own reason through, so an agent can fix a bad argument.
    const reason = await response
      .json()
      .then((body: { error?: unknown }) => (typeof body?.error === 'string' ? body.error : ''))
      .catch(() => '')
    throw new PlanBridgeUnavailableError(
      `Muster refused the ${args.refusedLabel ?? 'plan review'} (HTTP ${response.status})${reason ? `: ${reason}` : ''}.`
    )
  }
  return await response.json()
}

/** Opens the review and returns its id and round. Never waits for the person. */
export async function openPlanAnnotationThroughBridge(args: {
  bridgeFile: string
  request: PlanBridgeRequest
  fetchImpl?: typeof fetch
}): Promise<{ requestId: string; round: number }> {
  const answer = (await postToGuiBridge({
    bridgeFile: args.bridgeFile,
    path: '/plan/annotate',
    body: args.request,
    fetchImpl: args.fetchImpl
  })) as { requestId?: unknown; round?: unknown; error?: unknown }
  if (typeof answer.requestId !== 'string') {
    throw new PlanBridgeUnavailableError(NO_GUI)
  }
  return {
    requestId: answer.requestId,
    // The queue counts rounds; a missing number is a cosmetic fallback, not a lost review.
    round: typeof answer.round === 'number' ? answer.round : 1
  }
}

/** Parks for at most waitMs waiting on the person, then reports whatever is true so far. */
export async function collectPlanAnnotationThroughBridge(args: {
  bridgeFile: string
  reviewId: string
  waitMs: number
  fetchImpl?: typeof fetch
}): Promise<PlanReviewOutcome> {
  return (await postToGuiBridge({
    bridgeFile: args.bridgeFile,
    path: '/plan/collect',
    body: { reviewId: args.reviewId, waitMs: args.waitMs },
    fetchImpl: args.fetchImpl
  })) as PlanReviewOutcome
}
