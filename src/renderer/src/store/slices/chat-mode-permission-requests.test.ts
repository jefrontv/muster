import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import { createChatModeSlice } from './chat-mode'

const respondPermission = vi.fn().mockResolvedValue(true)

vi.stubGlobal('window', {
  api: { chatThreadStream: { respondPermission } }
} as never)

function makeStore() {
  return create<AppState>()(
    (...args) =>
      createChatModeSlice(...(args as Parameters<typeof createChatModeSlice>)) as AppState
  )
}

const request = (requestId: string) => ({
  requestId,
  toolName: 'Bash',
  input: { command: 'ls' }
})

describe('chat-mode permission request state', () => {
  beforeEach(() => {
    respondPermission.mockClear()
  })

  it('appends requests per thread and dedupes by requestId', () => {
    const store = makeStore()
    store.getState().addChatThreadPermissionRequest('t1', request('r1'))
    store.getState().addChatThreadPermissionRequest('t1', request('r2'))
    store.getState().addChatThreadPermissionRequest('t1', request('r1'))
    store.getState().addChatThreadPermissionRequest('t2', request('r1'))
    expect(store.getState().chatThreadPermissionRequests.t1?.map((r) => r.requestId)).toEqual([
      'r1',
      'r2'
    ])
    expect(store.getState().chatThreadPermissionRequests.t2).toHaveLength(1)
  })

  it('removes a single request and drops the thread key when empty', () => {
    const store = makeStore()
    store.getState().addChatThreadPermissionRequest('t1', request('r1'))
    store.getState().addChatThreadPermissionRequest('t1', request('r2'))
    store.getState().removeChatThreadPermissionRequest('t1', 'r1')
    expect(store.getState().chatThreadPermissionRequests.t1?.map((r) => r.requestId)).toEqual([
      'r2'
    ])
    store.getState().removeChatThreadPermissionRequest('t1', 'r2')
    expect('t1' in store.getState().chatThreadPermissionRequests).toBe(false)
    // Unknown ids are a no-op, not a crash.
    store.getState().removeChatThreadPermissionRequest('t1', 'ghost')
  })

  it('clears a thread queue on demand', () => {
    const store = makeStore()
    store.getState().addChatThreadPermissionRequest('t1', request('r1'))
    store.getState().addChatThreadPermissionRequest('t2', request('r2'))
    store.getState().clearChatThreadPermissionRequests('t1')
    expect('t1' in store.getState().chatThreadPermissionRequests).toBe(false)
    expect(store.getState().chatThreadPermissionRequests.t2).toHaveLength(1)
  })

  it('respond removes the entry optimistically and calls the stream API', () => {
    const store = makeStore()
    store.getState().addChatThreadPermissionRequest('t1', request('r1'))
    store.getState().respondChatThreadPermission('t1', 'r1', 'deny')
    expect('t1' in store.getState().chatThreadPermissionRequests).toBe(false)
    expect(respondPermission).toHaveBeenCalledWith({
      threadId: 't1',
      requestId: 'r1',
      behavior: 'deny'
    })
  })

  it('records session-allowed tools per thread without duplicates', () => {
    const store = makeStore()
    store.getState().allowChatThreadToolForSession('t1', 'Bash')
    store.getState().allowChatThreadToolForSession('t1', 'Bash')
    store.getState().allowChatThreadToolForSession('t1', 'Edit')
    store.getState().allowChatThreadToolForSession('t2', 'Bash')
    expect(store.getState().chatThreadSessionAllowedTools.t1).toEqual(['Bash', 'Edit'])
    expect(store.getState().chatThreadSessionAllowedTools.t2).toEqual(['Bash'])
    store.getState().clearChatThreadSessionAllowedTools('t1')
    expect('t1' in store.getState().chatThreadSessionAllowedTools).toBe(false)
    expect(store.getState().chatThreadSessionAllowedTools.t2).toEqual(['Bash'])
  })

  it('holds and clears a thread first message', () => {
    const store = makeStore()
    store.getState().setChatThreadFirstMessage('t1', 'build me a site')
    expect(store.getState().chatThreadFirstMessage.t1).toBe('build me a site')
    store.getState().clearChatThreadFirstMessage('t1')
    expect('t1' in store.getState().chatThreadFirstMessage).toBe(false)
    // Clearing an absent entry is a no-op, not a crash.
    store.getState().clearChatThreadFirstMessage('ghost')
  })
})
