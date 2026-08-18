import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storeState = vi.hoisted(() => ({
  settings: { chatAutoGenerateTitle: undefined as boolean | undefined },
  chatThreads: [] as { id: string; title: string; autoTitle?: string; titleGenerated?: boolean; workspaceId: string | null }[],
  chatWorkspaces: [] as { id: string; directories: string[] }[],
  chatThreadSessions: {} as Record<string, { paneKey: string }>,
  agentStatusByPaneKey: {} as Record<string, { prompt: string }>,
  chatThreadStreamingText: {} as Record<string, { text: string }>,
  updateChatThread: vi.fn(async () => undefined)
}))

vi.mock('../../store', () => ({
  useAppStore: { getState: () => storeState }
}))

import {
  chatThreadTitleIsAutomatic,
  generateChatThreadTitleAfterFirstTurn,
  resetChatThreadAutoTitleAttemptsForTests
} from './chat-thread-auto-title'

const generate = vi.fn(async () => ({ ok: true as const, title: 'Staging 500 triage' }))

beforeEach(() => {
  vi.clearAllMocks()
  resetChatThreadAutoTitleAttemptsForTests()
  storeState.settings = { chatAutoGenerateTitle: undefined }
  storeState.chatThreads = [
    {
      id: 't1',
      title: 'why is staging returning a 500 on every…',
      autoTitle: 'why is staging returning a 500 on every…',
      workspaceId: null
    }
  ]
  storeState.chatWorkspaces = []
  storeState.chatThreadSessions = { t1: { paneKey: 'chat:t1' } }
  storeState.agentStatusByPaneKey = {
    'chat:t1': { prompt: 'why is staging returning a 500 on every request' }
  }
  storeState.chatThreadStreamingText = { t1: { text: 'The nginx upstream is refusing…' } }
  vi.stubGlobal('window', { api: { chatThreadTitle: { generate } } })
})

afterEach(() => {
  resetChatThreadAutoTitleAttemptsForTests()
  vi.unstubAllGlobals()
})

describe('chatThreadTitleIsAutomatic', () => {
  it('treats an untouched and a Muster-set title as automatic', () => {
    expect(chatThreadTitleIsAutomatic({ title: 'New chat' })).toBe(true)
    expect(chatThreadTitleIsAutomatic({ title: 'Derived', autoTitle: 'Derived' })).toBe(true)
  })

  it('treats a renamed thread as the user’s', () => {
    expect(chatThreadTitleIsAutomatic({ title: 'My name', autoTitle: 'Derived' })).toBe(false)
  })
})

describe('generateChatThreadTitleAfterFirstTurn', () => {
  it('names the thread from the first prompt and the reply', async () => {
    await generateChatThreadTitleAfterFirstTurn('t1')
    expect(generate).toHaveBeenCalledWith({
      firstPrompt: 'why is staging returning a 500 on every request',
      assistantMessage: 'The nginx upstream is refusing…'
    })
    expect(storeState.updateChatThread).toHaveBeenCalledWith('t1', {
      title: 'Staging 500 triage',
      autoTitle: 'Staging 500 triage',
      titleGenerated: true
    })
  })

  it('runs in the workspace directory when the thread has one', async () => {
    storeState.chatThreads[0]!.workspaceId = 'w1'
    storeState.chatWorkspaces = [{ id: 'w1', directories: ['/Sites/acme'] }]
    await generateChatThreadTitleAfterFirstTurn('t1')
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/Sites/acme' }))
  })

  it('only ever generates once per thread', async () => {
    await generateChatThreadTitleAfterFirstTurn('t1')
    await generateChatThreadTitleAfterFirstTurn('t1')
    expect(generate).toHaveBeenCalledOnce()
  })

  it('skips a thread that already has a generated title', async () => {
    storeState.chatThreads[0]!.titleGenerated = true
    await generateChatThreadTitleAfterFirstTurn('t1')
    expect(generate).not.toHaveBeenCalled()
  })

  it('skips a thread the user renamed', async () => {
    storeState.chatThreads[0]!.title = 'Staging incident'
    await generateChatThreadTitleAfterFirstTurn('t1')
    expect(generate).not.toHaveBeenCalled()
  })

  it('honours the opt-out', async () => {
    storeState.settings = { chatAutoGenerateTitle: false }
    await generateChatThreadTitleAfterFirstTurn('t1')
    expect(generate).not.toHaveBeenCalled()
  })

  it('falls back to the derived title when status hooks reported no prompt', async () => {
    storeState.agentStatusByPaneKey = {}
    await generateChatThreadTitleAfterFirstTurn('t1')
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ firstPrompt: 'why is staging returning a 500 on every…' })
    )
  })

  it('leaves the title alone when generation fails', async () => {
    generate.mockResolvedValueOnce({ ok: false, error: 'no agent' } as never)
    await generateChatThreadTitleAfterFirstTurn('t1')
    expect(storeState.updateChatThread).not.toHaveBeenCalled()
  })

  it('does not overwrite a rename that landed while the agent was thinking', async () => {
    generate.mockImplementationOnce(async () => {
      storeState.chatThreads[0]!.title = 'Renamed mid-flight'
      return { ok: true as const, title: 'Staging 500 triage' }
    })
    await generateChatThreadTitleAfterFirstTurn('t1')
    expect(storeState.updateChatThread).not.toHaveBeenCalled()
  })
})
