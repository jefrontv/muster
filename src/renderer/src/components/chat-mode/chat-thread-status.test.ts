import { describe, expect, it } from 'vitest'
import {
  canMarkChatThreadUnread,
  hasUnseenCompletion,
  unreadVisitStamp,
  nextVisitStamp,
  resolveChatThreadStatus
} from './chat-thread-status'

describe('resolveChatThreadStatus', () => {
  it('puts approval above everything', () => {
    expect(
      resolveChatThreadStatus({
        agentState: 'working',
        hasPendingApproval: true,
        hasUnseenCompletion: true
      })
    ).toBe('approval')
  })

  it('treats blocked/waiting agent states as approval', () => {
    for (const agentState of ['blocked', 'waiting'] as const) {
      expect(
        resolveChatThreadStatus({
          agentState,
          hasPendingApproval: false,
          hasUnseenCompletion: false
        })
      ).toBe('approval')
    }
  })

  it('full access reads blocked/waiting as working — permissions auto-allow', () => {
    for (const agentState of ['blocked', 'waiting'] as const) {
      expect(
        resolveChatThreadStatus({
          agentState,
          hasPendingApproval: false,
          hasUnseenCompletion: false,
          hasFullAccess: true
        })
      ).toBe('working')
    }
  })

  it('a queued approval still wins under full access', () => {
    expect(
      resolveChatThreadStatus({
        agentState: 'blocked',
        hasPendingApproval: true,
        hasUnseenCompletion: false,
        hasFullAccess: true
      })
    ).toBe('approval')
  })

  it('working outranks unread completion', () => {
    expect(
      resolveChatThreadStatus({
        agentState: 'working',
        hasPendingApproval: false,
        hasUnseenCompletion: true
      })
    ).toBe('working')
  })

  it('reports unread-done, then idle', () => {
    expect(
      resolveChatThreadStatus({
        agentState: 'done',
        hasPendingApproval: false,
        hasUnseenCompletion: true
      })
    ).toBe('unread-done')
    expect(
      resolveChatThreadStatus({
        agentState: undefined,
        hasPendingApproval: false,
        hasUnseenCompletion: false
      })
    ).toBe('idle')
  })
})

describe('hasUnseenCompletion', () => {
  it('counts never-visited as read', () => {
    expect(hasUnseenCompletion({ lastCompletedAt: 100 })).toBe(false)
  })

  it('is false without a completion', () => {
    expect(hasUnseenCompletion({ lastVisitedAt: 100 })).toBe(false)
    expect(hasUnseenCompletion({})).toBe(false)
  })

  it('flags only completions newer than the last visit', () => {
    expect(hasUnseenCompletion({ lastCompletedAt: 200, lastVisitedAt: 100 })).toBe(true)
    expect(hasUnseenCompletion({ lastCompletedAt: 100, lastVisitedAt: 100 })).toBe(false)
    expect(hasUnseenCompletion({ lastCompletedAt: 50, lastVisitedAt: 100 })).toBe(false)
  })
})

describe('nextVisitStamp', () => {
  it('is monotonic against a completion ahead of the clock', () => {
    expect(nextVisitStamp(100, 250)).toBe(250)
    expect(nextVisitStamp(300, 250)).toBe(300)
    expect(nextVisitStamp(300, undefined)).toBe(300)
  })
})

describe('marking a thread unread', () => {
  it('leaves the thread reading as unread', () => {
    const thread = { lastCompletedAt: 5_000, lastVisitedAt: 6_000 }
    expect(hasUnseenCompletion(thread)).toBe(false)
    const marked = { ...thread, lastVisitedAt: unreadVisitStamp(thread.lastCompletedAt) }
    expect(hasUnseenCompletion(marked)).toBe(true)
  })

  it('round-trips back to read', () => {
    const marked = { lastCompletedAt: 5_000, lastVisitedAt: unreadVisitStamp(5_000) }
    const read = { ...marked, lastVisitedAt: nextVisitStamp(1_000, marked.lastCompletedAt) }
    expect(hasUnseenCompletion(read)).toBe(false)
  })

  it('is unavailable when nothing has completed', () => {
    // Never-visited counts as read, so clearing the stamp would be a no-op —
    // there has to be a completion to leave unseen.
    expect(canMarkChatThreadUnread({})).toBe(false)
    expect(canMarkChatThreadUnread({ lastCompletedAt: 5_000 })).toBe(true)
  })

  it('is unavailable when the thread is already unread', () => {
    expect(canMarkChatThreadUnread({ lastCompletedAt: 5_000, lastVisitedAt: 1_000 })).toBe(false)
  })
})
