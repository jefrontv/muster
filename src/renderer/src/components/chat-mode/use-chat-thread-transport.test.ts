// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatThread } from '../../../../shared/chat-mode-types'

const ensure = vi.fn()
let status = 'idle'
const sessions: Record<string, unknown> = {}

vi.mock('@/lib/chat-thread-session-ensure', () => ({ ensureChatThreadSession: ensure }))
vi.mock('@/components/chat-thread/chat-engine-thread-store', () => ({
  chatEngineThreadStore: () => ({ read: () => ({ meta: { status } }) })
}))
vi.mock('@/store', () => {
  const state = () => ({
    chatThreadSessions: sessions,
    chatThreadContextWindow: {},
    chatThreadFullAccess: {},
    chatThreadPermissionRequests: {},
    chatThreadMessageQueues: {},
    settings: null,
    updateChatThread: vi.fn()
  })
  const useAppStore = (select: (s: ReturnType<typeof state>) => unknown) => select(state())
  useAppStore.getState = state
  return { useAppStore }
})

const { useChatThreadTransport } = await import('./use-chat-thread-transport')
const thread = { id: 't1', title: 'Chat', claudeSessionId: 's1' } as unknown as ChatThread
const interrupt = vi.fn(async () => true)

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = { chatThreadStream: { interrupt } }
})
afterEach(() => {
  vi.clearAllMocks()
  status = 'idle'
  delete sessions.t1
})

describe('useChatThreadTransport interrupt', () => {
  it('takes over the running CLI after a reload so Stop works', async () => {
    status = 'working'
    ensure.mockResolvedValue({ id: 'session' })
    const { result } = renderHook(() => useChatThreadTransport({ thread, workspace: null }))
    await expect(result.current.transport.interrupt()).resolves.toBe(true)
    expect(ensure).toHaveBeenCalledWith('t1')
    expect(interrupt).toHaveBeenCalledWith('t1')
  })

  it('never launches a CLI just to stop an idle thread', async () => {
    const { result } = renderHook(() => useChatThreadTransport({ thread, workspace: null }))
    await expect(result.current.transport.interrupt()).resolves.toBe(false)
    expect(ensure).not.toHaveBeenCalled()
    expect(interrupt).not.toHaveBeenCalled()
  })
})
