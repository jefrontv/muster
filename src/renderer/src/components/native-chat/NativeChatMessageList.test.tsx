// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { NativeChatLiveSession } from './use-native-chat-live-session'
import { NATIVE_CHAT_LIVE_TAIL_ROWS, nativeChatVirtualSplit } from './NativeChatVirtualRows'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

import { NativeChatMessageList } from './NativeChatMessageList'

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void
const observers: ObserverCallback[] = []

beforeEach(() => {
  observers.length = 0
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: ObserverCallback) {
        observers.push(callback)
      }
      observe(): void {}
      disconnect(): void {}
    }
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    }
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const message = (id: string, role: 'user' | 'assistant', text: string): NativeChatMessage => ({
  id,
  role,
  blocks: [{ type: 'text', text }],
  timestamp: 1,
  source: 'transcript'
})

function session(loadEarlier: () => void): NativeChatLiveSession {
  return {
    messages: [message('u1', 'user', 'hi'), message('a1', 'assistant', 'hello')],
    status: 'ready',
    sessionId: 's1',
    agent: 'claude',
    hasMore: true,
    loadingEarlier: false,
    loadEarlier
  } as NativeChatLiveSession
}

describe('NativeChatMessageList paging', () => {
  it('loads an older page only when the top sentinel comes into view', () => {
    const loadEarlier = vi.fn()
    render(<NativeChatMessageList session={session(loadEarlier)} isWorking={false} fontScale={1} />)
    expect(loadEarlier).not.toHaveBeenCalled()
    act(() => observers.at(-1)?.([{ isIntersecting: false }]))
    expect(loadEarlier).not.toHaveBeenCalled()
    act(() => observers.at(-1)?.([{ isIntersecting: true }]))
    expect(loadEarlier).toHaveBeenCalledTimes(1)
  })
})

describe('nativeChatVirtualSplit', () => {
  it('keeps short threads unvirtualized and long ones with a live tail', () => {
    expect(nativeChatVirtualSplit(20)).toBe(0)
    expect(nativeChatVirtualSplit(200)).toBe(200 - NATIVE_CHAT_LIVE_TAIL_ROWS)
  })
})
