import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storeState = vi.hoisted(() => ({
  settings: { nativeChatPermissionMode: 'full' as string },
  chatThreads: [] as { id: string; claudeSessionId: string | null }[],
  chatThreadSessions: {} as Record<string, { paneKey: string }>,
  chatThreadPermissionRequests: {} as Record<string, unknown[]>,
  activeChatThreadId: null as string | null,
  addChatThreadPermissionRequest: vi.fn(),
  removeChatThreadPermissionRequest: vi.fn(),
  clearChatThreadPermissionRequests: vi.fn(),
  clearChatThreadSessionAllowedTools: vi.fn(),
  setChatThreadFullAccess: vi.fn(),
  setChatThreadSession: vi.fn(),
  clearAgentLaunchConfig: vi.fn(),
  clearChatThreadStreamingText: vi.fn(),
  appendChatThreadStreamingText: vi.fn(),
  sealChatThreadStreamingText: vi.fn(),
  setChatThreadContextWindow: vi.fn(),
  setChatThreadLastError: vi.fn(),
  settleAgentStatusWorking: vi.fn(),
  updateChatThread: vi.fn(async () => undefined)
}))

vi.mock('../store', () => ({ useAppStore: { getState: () => storeState } }))
vi.mock('../components/chat-mode/chat-thread-auto-title', () => ({
  generateChatThreadTitleAfterFirstTurn: vi.fn(async () => undefined)
}))

import { installChatThreadStreamEvents } from './chat-thread-stream-events'

let listener: ((event: Record<string, unknown>) => void) | null = null
const unsubscribe = vi.fn()
const pendingPermissions = vi.fn(async () => [] as unknown[])

beforeEach(() => {
  vi.clearAllMocks()
  listener = null
  vi.stubGlobal('window', {
    api: {
      chatThreadStream: {
        pendingPermissions,
        onEvent: (cb: (event: Record<string, unknown>) => void) => {
          listener = cb
          return unsubscribe
        }
      }
    }
  })
  vi.stubGlobal('document', { hasFocus: () => false })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('installChatThreadStreamEvents', () => {
  it('recovers the questions main is still blocked on', async () => {
    pendingPermissions.mockResolvedValueOnce([
      { threadId: 't1', requestId: 'r1', toolName: 'Bash', input: { command: 'ls' } }
    ])

    const stop = installChatThreadStreamEvents()
    await vi.waitFor(() => expect(storeState.addChatThreadPermissionRequest).toHaveBeenCalled())

    expect(storeState.addChatThreadPermissionRequest).toHaveBeenCalledWith('t1', {
      requestId: 'r1',
      toolName: 'Bash',
      input: { command: 'ls' }
    })
    stop()
  })

  it('routes a permission request through the store, which owns the full-access verdict', () => {
    const stop = installChatThreadStreamEvents()

    listener?.({ kind: 'permission-request', threadId: 't1', requestId: 'r9', toolName: 'Bash' })

    // The gate is not duplicated here; the store decides whether to auto-allow.
    expect(storeState.addChatThreadPermissionRequest).toHaveBeenCalledWith('t1', {
      requestId: 'r9',
      toolName: 'Bash',
      input: undefined
    })
    stop()
  })

  it('keeps delivering events after the chat page would have unmounted', () => {
    // The whole point of living outside ChatModePage: switching to Code mode
    // must not tear this down, or requests are dropped and turns stall.
    const stop = installChatThreadStreamEvents()

    listener?.({ kind: 'delta', threadId: 't1', text: 'still streaming' })

    expect(storeState.appendChatThreadStreamingText).toHaveBeenCalledWith('t1', 'still streaming')
    expect(unsubscribe).not.toHaveBeenCalled()
    stop()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('settles the pane when the turn completes', () => {
    storeState.chatThreadSessions = { t1: { paneKey: 'chat:t1' } }
    const stop = installChatThreadStreamEvents()

    listener?.({ kind: 'turn-complete', threadId: 't1', isError: false })

    expect(storeState.settleAgentStatusWorking).toHaveBeenCalledWith('chat:t1', expect.any(Number))
    stop()
  })

  it('records the failure when a turn errors', () => {
    const stop = installChatThreadStreamEvents()

    listener?.({
      kind: 'turn-complete',
      threadId: 't1',
      isError: true,
      errorMessage: 'Claude hit a rate limit'
    })

    expect(storeState.setChatThreadLastError).toHaveBeenCalledWith('t1', 'Claude hit a rate limit')
    stop()
  })

  it('falls back to generic copy when the CLI reports no message', () => {
    const stop = installChatThreadStreamEvents()

    listener?.({ kind: 'turn-complete', threadId: 't1', isError: true })

    expect(storeState.setChatThreadLastError).toHaveBeenCalledWith('t1', expect.stringContaining('error'))
    stop()
  })

  it('clears the previous failure once a turn succeeds', () => {
    const stop = installChatThreadStreamEvents()

    listener?.({ kind: 'turn-complete', threadId: 't1', isError: false })

    expect(storeState.setChatThreadLastError).toHaveBeenCalledWith('t1', null)
    stop()
  })

  it('clears the failure on the next turn\'s first token', () => {
    const stop = installChatThreadStreamEvents()

    listener?.({ kind: 'delta', threadId: 't1', text: 'hi' })

    expect(storeState.setChatThreadLastError).toHaveBeenCalledWith('t1', null)
    stop()
  })

  it('does not mark a failed turn as completed', () => {
    // lastCompletedAt is what turns the sidebar pill green; a failed turn that
    // sets it reads as a clean finish.
    const stop = installChatThreadStreamEvents()

    listener?.({ kind: 'turn-complete', threadId: 't1', isError: true, errorMessage: 'boom' })

    const update = storeState.updateChatThread.mock.calls.at(-1)?.[1] as Record<string, unknown>
    expect(update).not.toHaveProperty('lastCompletedAt')
    expect(update).toHaveProperty('lastActivityAt')
    stop()
  })

  it('still marks a successful turn as completed', () => {
    const stop = installChatThreadStreamEvents()

    listener?.({ kind: 'turn-complete', threadId: 't1', isError: false })

    const update = storeState.updateChatThread.mock.calls.at(-1)?.[1] as Record<string, unknown>
    expect(update).toHaveProperty('lastCompletedAt')
    stop()
  })
})
