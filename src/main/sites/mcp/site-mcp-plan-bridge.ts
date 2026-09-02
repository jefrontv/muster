// MCP-process client for the plan-review route on the site write bridge.
//
// Separate from site-mcp-store-bridge.ts for one reason: that client aborts at 5s, which is right
// for a site write and fatal here. A plan review is a person reading, so this one does not race a
// clock at all — the GUI's review queue owns the deadline and always answers, even on timeout.
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

export async function requestPlanAnnotationThroughBridge(args: {
  bridgeFile: string
  request: PlanBridgeRequest
  fetchImpl?: typeof fetch
}): Promise<PlanAnnotationResult> {
  const endpoint = readEndpointFile(args.bridgeFile)
  if (!endpoint) {
    throw new PlanBridgeUnavailableError(NO_GUI)
  }
  const doFetch = args.fetchImpl ?? fetch
  let response: Response
  try {
    response = await doFetch(`http://127.0.0.1:${endpoint.port}/plan/annotate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-muster-site-bridge-token': endpoint.token
      },
      body: JSON.stringify(args.request)
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
  return (await response.json()) as PlanAnnotationResult
}
