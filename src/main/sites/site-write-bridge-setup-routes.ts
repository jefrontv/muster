// The setup routes on the site write bridge: approval cards (/approval/*) and the read-only
// setup lookups and approved writes (/setup/read, /setup/write). All of them need the GUI, which owns the live state.

import type {
  SiteSetupApprovalDecision,
  SiteSetupApprovalInput,
  SiteSetupApprovalOutcome
} from '../../shared/site-setup-approval-types'
import { readSetupApprovalInput } from './site-setup-approval-input'
import {
  isSiteSetupReadOp,
  isSiteSetupWriteOp,
  type SiteSetupReadOp,
  type SiteSetupWriteOp
} from '../../shared/site-setup-bridge-ops'

export const SETUP_BRIDGE_ROUTES = [
  '/approval/request',
  '/approval/collect',
  '/setup/read',
  '/setup/write'
] as const
export type SetupBridgeRoute = (typeof SETUP_BRIDGE_ROUTES)[number]

export function isSetupBridgeRoute(url: string | undefined): url is SetupBridgeRoute {
  return (SETUP_BRIDGE_ROUTES as readonly (string | undefined)[]).includes(url)
}

export type SetupBridgeCallbacks = {
  /** Stages an agent's setup request for the user. Absent = feature off. */
  onSetupApprovalRequested?: (
    input: SiteSetupApprovalInput
  ) => { requestId: string; decision: SiteSetupApprovalDecision | null } | { error: 'no-window' }
  onSetupApprovalCollect?: (requestId: string, waitMs: number) => Promise<SiteSetupApprovalOutcome>
  onSetupRead?: (op: SiteSetupReadOp, args: Record<string, unknown>) => Promise<unknown>
  /** Runs an approved write; the callback spends the approval before doing anything. */
  onSetupWrite?: (
    op: SiteSetupWriteOp,
    approvalId: string,
    args: Record<string, unknown>
  ) => Promise<unknown>
}

type Reply = (status: number, payload: unknown) => void

const UNSUPPORTED = { error: 'this build cannot answer setup requests' }

function bodyArgs(body: Record<string, unknown>): Record<string, unknown> {
  return body.args && typeof body.args === 'object' && !Array.isArray(body.args)
    ? (body.args as Record<string, unknown>)
    : {}
}

// A bad argument is the caller's mistake: report it as a 400 the agent can read and correct.
function settle(work: Promise<unknown>, reply: Reply): Promise<void> {
  return work.then(
    (value) => reply(200, { value }),
    (error: unknown) =>
      reply(error instanceof TypeError ? 400 : 500, {
        error: error instanceof Error ? error.message : String(error)
      })
  )
}

function answerReadOrWrite(
  route: '/setup/read' | '/setup/write',
  body: Record<string, unknown>,
  reply: Reply,
  callbacks: SetupBridgeCallbacks
): Promise<void> {
  if (route === '/setup/read') {
    if (!callbacks.onSetupRead) {
      reply(404, UNSUPPORTED)
    } else if (!isSiteSetupReadOp(body.op)) {
      reply(400, { error: 'unknown setup read' })
    } else {
      return settle(callbacks.onSetupRead(body.op, bodyArgs(body)), reply)
    }
    return Promise.resolve()
  }
  const approvalId = typeof body.approvalId === 'string' ? body.approvalId : ''
  if (!callbacks.onSetupWrite) {
    reply(404, UNSUPPORTED)
  } else if (!isSiteSetupWriteOp(body.op) || approvalId.length === 0) {
    reply(400, { error: 'a known setup write and its approvalId are required' })
  } else {
    return settle(callbacks.onSetupWrite(body.op, approvalId, bodyArgs(body)), reply)
  }
  return Promise.resolve()
}

export async function answerSetupBridgeRoute(
  route: SetupBridgeRoute,
  body: Record<string, unknown>,
  reply: Reply,
  callbacks: SetupBridgeCallbacks
): Promise<void> {
  if (route === '/setup/read' || route === '/setup/write') {
    await answerReadOrWrite(route, body, reply, callbacks)
    return
  }
  if (route === '/approval/request') {
    const open = callbacks.onSetupApprovalRequested
    if (!open) {
      reply(404, UNSUPPORTED)
      return
    }
    const input = readSetupApprovalInput(body)
    if (!input) {
      reply(400, { error: 'action, title and summary are required' })
      return
    }
    // Answered at once; the person's decision is collected on /approval/collect.
    reply(200, open(input))
    return
  }
  const collect = callbacks.onSetupApprovalCollect
  if (!collect) {
    reply(404, UNSUPPORTED)
    return
  }
  const requestId = typeof body.requestId === 'string' ? body.requestId : ''
  if (requestId.length === 0) {
    reply(400, { error: 'requestId is required' })
    return
  }
  const waitMs = typeof body.waitMs === 'number' ? body.waitMs : 0
  reply(200, await collect(requestId, waitMs))
}
