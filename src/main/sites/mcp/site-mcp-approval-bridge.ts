// MCP-process client for the setup-approval routes. No fallback: an approval needs a person.

import type {
  SiteSetupApprovalDecision,
  SiteSetupApprovalInput,
  SiteSetupApprovalOutcome
} from '../../../shared/site-setup-approval-types'
import type { SiteSetupReadOp, SiteSetupWriteOp } from '../../../shared/site-setup-bridge-ops'
import { PlanBridgeUnavailableError, postToGuiBridge } from './site-mcp-plan-bridge'

const NO_GUI =
  'No Muster window is running, so there is nobody to approve this. Open Muster and try again.'

export async function openSetupApprovalThroughBridge(args: {
  bridgeFile: string
  input: SiteSetupApprovalInput
  fetchImpl?: typeof fetch
}): Promise<{ requestId: string; decision: SiteSetupApprovalDecision | null }> {
  const answer = (await postToGuiBridge({
    bridgeFile: args.bridgeFile,
    path: '/approval/request',
    body: args.input,
    fetchImpl: args.fetchImpl,
    noGui: NO_GUI,
    refusedLabel: 'approval request'
  })) as { requestId?: unknown; decision?: unknown }
  if (typeof answer.requestId !== 'string') {
    // `{ error: 'no-window' }`: the bridge is up but no window is listening for cards.
    throw new PlanBridgeUnavailableError(NO_GUI)
  }
  return {
    requestId: answer.requestId,
    decision:
      typeof answer.decision === 'string' ? (answer.decision as SiteSetupApprovalDecision) : null
  }
}

/** A read-only setup lookup answered by the GUI. Same no-GUI message: these also need Muster open. */
export async function readSetupThroughBridge(args: {
  bridgeFile: string
  op: SiteSetupReadOp
  args: Record<string, unknown>
  fetchImpl?: typeof fetch
}): Promise<unknown> {
  const answer = (await postToGuiBridge({
    bridgeFile: args.bridgeFile,
    path: '/setup/read',
    body: { op: args.op, args: args.args },
    fetchImpl: args.fetchImpl,
    noGui:
      'No Muster window is running, so this setup lookup cannot be answered. Open Muster and try again.',
    refusedLabel: 'setup lookup'
  })) as { value?: unknown }
  return answer.value
}

/** Runs an approved write in the GUI. The GUI refuses an id it did not approve for this op. */
export async function writeSetupThroughBridge(args: {
  bridgeFile: string
  op: SiteSetupWriteOp
  approvalId: string
  args: Record<string, unknown>
  fetchImpl?: typeof fetch
}): Promise<unknown> {
  const answer = (await postToGuiBridge({
    bridgeFile: args.bridgeFile,
    path: '/setup/write',
    body: { op: args.op, approvalId: args.approvalId, args: args.args },
    fetchImpl: args.fetchImpl,
    noGui: NO_GUI,
    refusedLabel: 'setup change'
  })) as { value?: unknown }
  return answer.value
}

export async function collectSetupApprovalThroughBridge(args: {
  bridgeFile: string
  requestId: string
  waitMs: number
  fetchImpl?: typeof fetch
}): Promise<SiteSetupApprovalOutcome> {
  return (await postToGuiBridge({
    bridgeFile: args.bridgeFile,
    path: '/approval/collect',
    body: { requestId: args.requestId, waitMs: args.waitMs },
    fetchImpl: args.fetchImpl,
    noGui: NO_GUI,
    refusedLabel: 'approval request'
  })) as SiteSetupApprovalOutcome
}
