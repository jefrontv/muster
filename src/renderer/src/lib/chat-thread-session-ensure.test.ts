import { beforeEach, describe, expect, it, vi } from 'vitest'

const launchChatThreadSession = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({
  chatThreads: [{ id: 't1', workspaceId: 'w1' }] as { id: string; workspaceId: string | null }[],
  chatWorkspaces: [{ id: 'w1', directories: ['/site'] }],
  chatThreadSessions: {} as Record<string, { tabId: string; leafId: string; paneKey: string }>,
  chatThreadSessionTouchedAt: {} as Record<string, number>,
  chatThreadPermissionRequests: {} as Record<string, unknown[]>,
  chatThreadStreamingText: {} as Record<string, { sealed: boolean }>,
  chatThreadFirstMessage: {} as Record<string, string>,
  agentStatusByPaneKey: {} as Record<string, { state: string }>,
  activeChatThreadId: 't1' as string | null,
  setChatThreadLaunching: vi.fn(),
  setChatThreadSessionEnd: vi.fn(),
  setChatThreadLastError: vi.fn(),
  setChatThreadSession: vi.fn((threadId: string, session: unknown) => {
    if (session) {
      state.chatThreadSessions[threadId] = session as never
    } else {
      delete state.chatThreadSessions[threadId]
    }
  }),
  touchChatThreadSession: vi.fn(),
  clearAgentLaunchConfig: vi.fn(),
  settleAgentStatusWorking: vi.fn(),
  clearChatThreadStreamingText: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./chat-thread-session-launch', () => ({ launchChatThreadSession }))

const { ensureChatThreadSession, enforceChatThreadIdleSessionCap } =
  await import('./chat-thread-session-ensure')
const { ChatThreadFolderMissingError } = await import('./chat-thread-folder-missing')

const stop = vi.fn(async () => undefined)

beforeEach(() => {
  vi.clearAllMocks()
  state.chatThreadSessions = {}
  vi.stubGlobal('window', { api: { chatThreadStream: { stop } } })
})

describe('ensureChatThreadSession', () => {
  it('launches once even when a prewarm and a send race', async () => {
    launchChatThreadSession.mockResolvedValue({ tabId: 'a', leafId: 'b', paneKey: 'a:b' })
    const [first, second] = await Promise.all([
      ensureChatThreadSession('t1'),
      ensureChatThreadSession('t1')
    ])
    expect(launchChatThreadSession).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
    expect(state.setChatThreadLaunching).toHaveBeenNthCalledWith(1, 't1', true)
    expect(state.setChatThreadLaunching).toHaveBeenLastCalledWith('t1', false)
  })

  it('reuses a live session without launching', async () => {
    state.chatThreadSessions.t1 = { tabId: 'a', leafId: 'b', paneKey: 'a:b' }
    await ensureChatThreadSession('t1')
    expect(launchChatThreadSession).not.toHaveBeenCalled()
    expect(state.touchChatThreadSession).toHaveBeenCalledWith('t1')
  })

  it('records a missing folder for the notice instead of throwing', async () => {
    launchChatThreadSession.mockRejectedValue(new ChatThreadFolderMissingError('/site'))
    expect(await ensureChatThreadSession('t1')).toBeNull()
    expect(state.setChatThreadSessionEnd).toHaveBeenLastCalledWith('t1', {
      failed: true,
      message: 'Folder not found: /site',
      missingFolder: '/site'
    })
  })
})

describe('enforceChatThreadIdleSessionCap', () => {
  it('quietly stops the oldest idle process past the cap', () => {
    for (const [index, id] of ['t1', 'a', 'b', 'c', 'd'].entries()) {
      state.chatThreadSessions[id] = { tabId: id, leafId: id, paneKey: `${id}:p` }
      state.chatThreadSessionTouchedAt[id] = index
    }
    enforceChatThreadIdleSessionCap()
    expect(stop).toHaveBeenCalledWith('a')
    expect(stop).toHaveBeenCalledTimes(1)
    expect(state.chatThreadSessions.a).toBeUndefined()
    expect(state.settleAgentStatusWorking).toHaveBeenCalledWith('a:p', expect.any(Number))
  })
})
