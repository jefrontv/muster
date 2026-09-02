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
  PlanAnnotationRequest,
  PlanAnnotationResult
} from '../../../shared/plan-annotation-types'
import type { SiteWriteBridgeEndpoint } from '../site-write-bridge-server'

export type PlanBridgeRequest = Omit<PlanAnnotationRequest, 'requestId'>

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

export type PlanReviewOutcome =
  | { status: 'settled'; result: PlanAnnotationResult }
  | { status: 'pending'; openedMs: number }
  | { status: 'unknown' }

async function post(args: {
  bridgeFile: string
  path: string
  body: unknown
  fetchImpl?: typeof fetch
}): Promise<unknown> {
  const endpoint = readEndpointFile(args.bridgeFile)
  if (!endpoint) {
    throw new PlanBridgeUnavailableError(NO_GUI)
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
  } catch {
    // A stale endpoint file pointing at a dead port reads the same as no GUI to the caller.
    throw new PlanBridgeUnavailableError(NO_GUI)
  }
  if (!response.ok) {
    throw new PlanBridgeUnavailableError(
      `Muster refused the plan review (HTTP ${response.status}).`
    )
  }
  return await response.json()
}

/** Opens the review and returns its id. Never waits for the person. */
export async function openPlanAnnotationThroughBridge(args: {
  bridgeFile: string
  request: PlanBridgeRequest
  fetchImpl?: typeof fetch
}): Promise<{ requestId: string }> {
  const answer = (await post({
    bridgeFile: args.bridgeFile,
    path: '/plan/annotate',
    body: args.request,
    fetchImpl: args.fetchImpl
  })) as { requestId?: unknown; error?: unknown }
  if (typeof answer.requestId !== 'string') {
    throw new PlanBridgeUnavailableError(NO_GUI)
  }
  return { requestId: answer.requestId }
}

/** Parks for at most waitMs waiting on the person, then reports whatever is true so far. */
export async function collectPlanAnnotationThroughBridge(args: {
  bridgeFile: string
  reviewId: string
  waitMs: number
  fetchImpl?: typeof fetch
}): Promise<PlanReviewOutcome> {
  return (await post({
    bridgeFile: args.bridgeFile,
    path: '/plan/collect',
    body: { reviewId: args.reviewId, waitMs: args.waitMs },
    fetchImpl: args.fetchImpl
  })) as PlanReviewOutcome
}
