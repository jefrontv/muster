// One resolved status per chat thread, driving the sidebar row's label and fade.
// Pure: callers feed store snapshots in.

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

/**
 * Stamp that makes a thread read as unread again.
 *
 * Why not just clear lastVisitedAt: an absent stamp means never-visited, which
 * counts as READ (see above), so clearing it would mark the thread read — the
 * exact opposite. Sitting one tick behind the completion is what reads as unread.
 */
export function unreadVisitStamp(lastCompletedAt: number): number {
  return lastCompletedAt - 1
}

/** Nothing has completed, so there is no completion to leave unread. */
export function canMarkChatThreadUnread(thread: {
  lastCompletedAt?: number
  lastVisitedAt?: number
}): boolean {
  return thread.lastCompletedAt !== undefined && !hasUnseenCompletion(thread)
}

/** Monotonic visit stamp: a completion recorded ahead of the local clock must
 *  still read as seen after a visit. */
export function nextVisitStamp(now: number, lastCompletedAt: number | undefined): number {
  return Math.max(now, lastCompletedAt ?? 0)
}
