import { describe, expect, it } from 'vitest'
import {
  CHAT_THREAD_SETTLED_AFTER_MS,
  hasUnseenCompletion,
  isChatThreadSettled,
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

describe('isChatThreadSettled', () => {
  const now = 10 * CHAT_THREAD_SETTLED_AFTER_MS

  it('settles idle threads quiet past the window', () => {
    expect(
      isChatThreadSettled({
        status: 'idle',
        lastActivityAt: now - CHAT_THREAD_SETTLED_AFTER_MS - 1,
        now
      })
    ).toBe(true)
  })

  it('keeps recent or exactly-at-boundary threads active', () => {
    expect(
      isChatThreadSettled({
        status: 'idle',
        lastActivityAt: now - CHAT_THREAD_SETTLED_AFTER_MS,
        now
      })
    ).toBe(false)
    expect(isChatThreadSettled({ status: 'idle', lastActivityAt: now - 1_000, now })).toBe(false)
  })

  it('never settles threads that need a human or are in motion', () => {
    for (const status of ['approval', 'working', 'unread-done'] as const) {
      expect(isChatThreadSettled({ status, lastActivityAt: 0, now })).toBe(false)
    }
  })
})
