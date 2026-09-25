import { describe, expect, it } from 'vitest'
import {
  chatThreadDisplayTitle,
  describeChatThreadInputRequest,
  isChatThreadWatched,
  shouldNotifyChatThreadNeedsInput
} from './chat-thread-attention'

const onThread = { activeView: 'chat', chatTasksOpen: false, activeChatThreadId: 't1' } as const

describe('isChatThreadWatched', () => {
  it('counts the open thread in a focused window as seen', () => {
    expect(isChatThreadWatched(onThread, 't1', true)).toBe(true)
  })

  it('does not count a thread that is only selected behind another view', () => {
    // closeChatPage keeps activeChatThreadId, so selection alone would swallow the banner.
    expect(isChatThreadWatched({ ...onThread, activeView: 'terminal' }, 't1', true)).toBe(false)
    expect(isChatThreadWatched({ ...onThread, chatTasksOpen: true }, 't1', true)).toBe(false)
    expect(isChatThreadWatched(onThread, 't1', false)).toBe(false)
    expect(isChatThreadWatched(onThread, 't2', true)).toBe(false)
  })
})

describe('chat thread banner copy', () => {
  it('falls back to a generic name for an untitled thread', () => {
    expect(chatThreadDisplayTitle(undefined)).toBe('Chat')
    expect(chatThreadDisplayTitle('Fix the footer')).toBe('Fix the footer')
  })

  it('tells a question apart from a tool approval', () => {
    expect(describeChatThreadInputRequest('AskUserQuestion')).toBe('Claude asked you a question.')
    expect(describeChatThreadInputRequest('Bash')).toBe('Approve Bash to continue.')
  })
})

describe('shouldNotifyChatThreadNeedsInput', () => {
  const settings = (overrides: Record<string, boolean>) =>
    ({ notifications: { enabled: true, agentNeedsInput: true, ...overrides } }) as never

  it('alerts only for an unwatched thread with the toggle on', () => {
    expect(shouldNotifyChatThreadNeedsInput({ watched: false, settings: settings({}) })).toBe(true)
    expect(shouldNotifyChatThreadNeedsInput({ watched: true, settings: settings({}) })).toBe(false)
    expect(
      shouldNotifyChatThreadNeedsInput({
        watched: false,
        settings: settings({ agentNeedsInput: false })
      })
    ).toBe(false)
    expect(
      shouldNotifyChatThreadNeedsInput({ watched: false, settings: settings({ enabled: false }) })
    ).toBe(false)
  })
})
