// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { ChatThread, ChatWorkspace } from '../../../../shared/chat-mode-types'
import { useProjectPagesAgentThread } from './use-project-pages-agent-thread'

const repo = { path: '/repo', displayName: 'Repo' }
const workspace = { id: 'w1', directories: ['/repo'] } as ChatWorkspace
const thread = { id: 't1', workspaceId: 'w1' } as ChatThread

function stubChat() {
  const createChatWorkspace = vi.fn(async () => workspace)
  const createChatThread = vi.fn(async () => {
    useAppStore.setState({ chatThreads: [thread] })
    return thread
  })
  const setChatThreadFirstMessage = vi.fn()
  useAppStore.setState({
    chatModeHydrated: true,
    hydrateChatMode: vi.fn(async () => {}),
    chatWorkspaces: [],
    chatThreads: [],
    createChatWorkspace,
    createChatThread,
    setChatThreadFirstMessage
  } as never)
  return { createChatWorkspace, createChatThread, setChatThreadFirstMessage }
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

describe('useProjectPagesAgentThread', () => {
  it('creates nothing until the first message, then reopens that thread', async () => {
    const chat = stubChat()
    const first = renderHook(() => useProjectPagesAgentThread('repo:a', repo))
    renderHook(() => useProjectPagesAgentThread('repo:b', repo))
    expect(chat.createChatWorkspace).not.toHaveBeenCalled()
    expect(chat.createChatThread).not.toHaveBeenCalled()
    expect(first.result.current.thread).toBeNull()

    await act(() => first.result.current.start('  Summarise the plan  '))
    expect(chat.createChatThread).toHaveBeenCalledTimes(1)
    expect(chat.setChatThreadFirstMessage).toHaveBeenCalledWith('t1', 'Summarise the plan')
    expect(first.result.current.thread?.id).toBe('t1')
    first.unmount()

    const back = renderHook(() => useProjectPagesAgentThread('repo:a', repo))
    expect(back.result.current.thread?.id).toBe('t1')
    expect(chat.createChatThread).toHaveBeenCalledTimes(1)
  })
})
