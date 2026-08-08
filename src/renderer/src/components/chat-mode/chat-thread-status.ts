// One resolved status per chat thread, driving the sidebar row's label, fade,
// and settled-shelf placement. Pure: callers feed store snapshots in.

import type { AgentStatusState } from '../../../../shared/agent-status-types'

/** 'input' and 'failed' are reserved — no chat-mode source emits them yet. */
export type ChatThreadStatus = 'approval' | 'working' | 'unread-done' | 'idle' | 'input' | 'failed'

export function resolveChatThreadStatus(args: {
  agentState: AgentStatusState | undefined
  hasPendingApproval: boolean
  hasUnseenCompletion: boolean
  /** Full access auto-allows every permission request, so a hook-reported
   *  blocked/waiting is a stale permission prompt, not a human stall. */
  hasFullAccess?: boolean
}): ChatThreadStatus {
  if (args.hasPendingApproval) {
    return 'approval'
  }
  // blocked/waiting = the agent stalled on a human; reads amber like an approval.
  if (args.agentState === 'blocked' || args.agentState === 'waiting') {
    return args.hasFullAccess ? 'working' : 'approval'
  }
  if (args.agentState === 'working') {
    return 'working'
  }
  if (args.hasUnseenCompletion) {
    return 'unread-done'
  }
  return 'idle'
}

/** T3 rule: never-visited counts as READ — a fresh install must not light up
 *  every historical thread as unread. */
export function hasUnseenCompletion(thread: {
  lastCompletedAt?: number
  lastVisitedAt?: number
}): boolean {
  if (thread.lastCompletedAt === undefined || thread.lastVisitedAt === undefined) {
    return false
  }
  return thread.lastCompletedAt > thread.lastVisitedAt
}

/** Monotonic visit stamp: a completion recorded ahead of the local clock must
 *  still read as seen after a visit. */
export function nextVisitStamp(now: number, lastCompletedAt: number | undefined): number {
  return Math.max(now, lastCompletedAt ?? 0)
}

export const CHAT_THREAD_SETTLED_AFTER_MS = 3 * 24 * 60 * 60 * 1_000

/** Settled-shelf expanded view caps here — no paging for now. */
export const CHAT_SETTLED_SHELF_MAX_ROWS = 20

/** A thread settles only when nothing needs a human (idle) and it has been
 *  quiet past the window. Any new activity moves lastActivityAt and revives it. */
export function isChatThreadSettled(args: {
  status: ChatThreadStatus
  lastActivityAt: number
  now: number
}): boolean {
  if (args.status !== 'idle') {
    return false
  }
  return args.now - args.lastActivityAt > CHAT_THREAD_SETTLED_AFTER_MS
}
