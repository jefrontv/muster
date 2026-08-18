import { describe, expect, it, vi } from 'vitest'
import type { ChatModeState, ChatThread, ChatWorkspace } from '../../shared/chat-mode-types'
import { callChatConnectorTool, type ChatConnectorToolDeps } from './chat-connector-tools'
import {
  requestChatConnectorConfirm,
  respondChatConnectorConfirm,
  setChatConnectorConfirmSender,
  clearChatConnectorConfirmsForTests
} from './chat-connector-confirm'

function workspace(overrides: Partial<ChatWorkspace> = {}): ChatWorkspace {
  return {
    id: 'w1',
    name: 'Client site',
    directories: ['/sites/client'],
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function thread(overrides: Partial<ChatThread> = {}): ChatThread {
  return {
    id: 't1',
    workspaceId: 'w1',
    title: 'New chat',
    agent: 'claude',
    claudeSessionId: null,
    transcriptPath: null,
    createdAt: 1,
    lastActivityAt: Date.now(),
    ...overrides
  }
}

type Harness = {
  deps: ChatConnectorToolDeps
  state: ChatModeState
  deleted: string[]
  stopped: string[]
  broadcasts: () => number
  setModel: () => string | null
}

function createHarness(args?: {
  threads?: ChatThread[]
  workspaces?: ChatWorkspace[]
  confirm?: boolean
  learnedModels?: string[]
  existingDirs?: string[]
}): Harness {
  const state: ChatModeState = {
    version: 1,
    workspaces: args?.workspaces ?? [workspace()],
    threads: args?.threads ?? [thread()]
  }
  const deleted: string[] = []
  const stopped: string[] = []
  let broadcastCount = 0
  let modelWritten: string | null = null
  const existing = new Set(args?.existingDirs ?? [])
  const deps: ChatConnectorToolDeps = {
    getChatState: () => state,
    updateWorkspace: (id, patch) => {
      const target = state.workspaces.find((w) => w.id === id)
      if (!target) {
        return null
      }
      Object.assign(target, patch)
      return target
    },
    updateThread: (id, patch) => {
      const target = state.threads.find((t) => t.id === id)
      if (!target) {
        return null
      }
      Object.assign(target, patch)
      return target
    },
    deleteThread: (id) => {
      const index = state.threads.findIndex((t) => t.id === id)
      if (index < 0) {
        return false
      }
      state.threads.splice(index, 1)
      deleted.push(id)
      return true
    },
    getDefaultModel: () => modelWritten,
    setDefaultModel: (modelId) => {
      modelWritten = modelId
    },
    listLearnedModels: async () =>
      Object.fromEntries((args?.learnedModels ?? []).map((m) => [m, { lastSeenAt: 1 }])),
    confirm: vi.fn(async () => args?.confirm ?? true),
    stopThreadStream: (threadId) => stopped.push(threadId),
    broadcastChange: () => {
      broadcastCount += 1
    },
    directoryExists: (path) => existing.has(path),
    createWorkspace: ({ name, directories }) => {
      const created: ChatWorkspace = {
        id: `w${state.workspaces.length + 1}`,
        name,
        directories,
        createdAt: 1,
        updatedAt: 1
      }
      state.workspaces.push(created)
      return created
    },
    moveThread: (id, workspaceId) => {
      const target = state.threads.find((t) => t.id === id)
      if (!target) {
        return null
      }
      if (workspaceId !== null && !state.workspaces.some((w) => w.id === workspaceId)) {
        return null
      }
      target.workspaceId = workspaceId
      return target
    }
  }
  return { deps, state, deleted, stopped, broadcasts: () => broadcastCount, setModel: () => modelWritten }
}

function call(
  harness: Harness,
  name: string,
  toolArgs: Record<string, unknown> = {},
  threadId = 't1'
): ReturnType<typeof callChatConnectorTool> {
  return callChatConnectorTool({ name, args: toolArgs, threadId, deps: harness.deps })
}

describe('callChatConnectorTool scoping', () => {
  it('rejects calls from threads that no longer exist', async () => {
    const harness = createHarness()
    const result = await call(harness, 'workspace_get_settings', {}, 'gone')
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('no longer exists')
  })

  it('gives standalone chats a friendly no-workspace error for workspace tools', async () => {
    const harness = createHarness({ threads: [thread({ workspaceId: null })] })
    for (const name of [
      'workspace_get_settings',
      'workspace_update_settings',
      'workspace_set_directories'
    ]) {
      const result = await call(harness, name, { name: 'x', directories: ['/x'] })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("isn't in a workspace")
    }
  })

  it('reports settings with thread counts and the resolved default model', async () => {
    const harness = createHarness({
      workspaces: [workspace({ notes: 'Notes.', urls: ['https://example.com/'] })],
      threads: [thread(), thread({ id: 't2', archived: true })]
    })
    const result = await call(harness, 'workspace_get_settings')
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.name).toBe('Client site')
    expect(parsed.threadCount).toBe(2)
    expect(parsed.archivedThreadCount).toBe(1)
    expect(parsed.defaultModel).toContain('CLI default')
  })

  it('lists only threads in the calling scope and marks the caller', async () => {
    const harness = createHarness({
      threads: [thread(), thread({ id: 't2', title: 'Other' }), thread({ id: 't3', workspaceId: null })]
    })
    const rows = JSON.parse((await call(harness, 'list_threads')).content[0].text)
    expect(rows.map((r: { id: string }) => r.id)).toEqual(['t1', 't2'])
    expect(rows[0].isCurrentChat).toBe(true)
  })

  it('rejects unknown tools', async () => {
    const result = await call(createHarness(), 'delete_workspace')
    expect(result.isError).toBe(true)
  })
})

describe('workspace_update_settings', () => {
  it('normalizes urls/emails/notes through the shared normalizers', async () => {
    const harness = createHarness()
    const result = await call(harness, 'workspace_update_settings', {
      name: `  Renamed ${'x'.repeat(300)}`,
      urls: ['example.com', 'https://example.com', 'not a url'],
      clientEmails: ['Jane@Client.com', 'nope'],
      notes: `  ${'n'.repeat(5000)}  `
    })
    expect(result.isError).toBeUndefined()
    const w = harness.state.workspaces[0]
    expect(w.name.length).toBeLessThanOrEqual(120)
    expect(w.urls).toEqual(['https://example.com/'])
    expect(w.clientEmails).toEqual(['jane@client.com'])
    expect(w.notes?.length).toBe(4000)
    expect(harness.broadcasts()).toBe(1)
  })

  it('rejects invalid colors and empty patches without writing', async () => {
    const harness = createHarness()
    expect((await call(harness, 'workspace_update_settings', { color: 'reddish' })).isError).toBe(
      true
    )
    expect((await call(harness, 'workspace_update_settings', {})).isError).toBe(true)
    expect(harness.broadcasts()).toBe(0)
  })

  it('accepts hex colors', async () => {
    const harness = createHarness()
    await call(harness, 'workspace_update_settings', { color: 'E5484D' })
    expect(harness.state.workspaces[0].color).toBe('#e5484d')
  })
})

describe('workspace_set_directories', () => {
  it('rejects paths that do not exist', async () => {
    const harness = createHarness({ existingDirs: ['/real'] })
    const result = await call(harness, 'workspace_set_directories', {
      directories: ['/real', '/missing']
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('/missing')
    expect(harness.state.workspaces[0].directories).toEqual(['/sites/client'])
  })

  it('replaces directories and says the change applies to new chats', async () => {
    const harness = createHarness({ existingDirs: ['/real'] })
    const result = await call(harness, 'workspace_set_directories', { directories: ['/real'] })
    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toContain('takes effect on newly launched chats')
    expect(harness.state.workspaces[0].directories).toEqual(['/real'])
    expect(harness.broadcasts()).toBe(1)
  })
})

describe('set_default_model', () => {
  it('rejects models the app has never seen, listing known ids', async () => {
    const harness = createHarness({ learnedModels: ['claude-opus-5'] })
    const result = await call(harness, 'set_default_model', { model: 'claude-imaginary' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('claude-opus-5')
    expect(harness.setModel()).toBeNull()
  })

  it('sets a learned model and notes it applies to new/relaunched chats', async () => {
    const harness = createHarness({ learnedModels: ['claude-opus-5'] })
    const result = await call(harness, 'set_default_model', { model: 'claude-opus-5' })
    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toContain('relaunch')
    expect(harness.setModel()).toBe('claude-opus-5')
  })
})

describe('thread tools', () => {
  it('renames the calling thread by default and clamps the title', async () => {
    const harness = createHarness()
    await call(harness, 'rename_thread', { title: `  ${'t'.repeat(400)}` })
    expect(harness.state.threads[0].title.length).toBe(200)
    expect(harness.broadcasts()).toBe(1)
  })

  it('refuses to rename threads outside the scope', async () => {
    const harness = createHarness({
      threads: [thread(), thread({ id: 'other', workspaceId: null })]
    })
    const result = await call(harness, 'rename_thread', { threadId: 'other', title: 'X' })
    expect(result.isError).toBe(true)
  })

  it('archives and unarchives in-scope threads', async () => {
    const harness = createHarness({ threads: [thread(), thread({ id: 't2' })] })
    await call(harness, 'archive_threads', { threadIds: ['t2'] })
    expect(harness.state.threads[1].archived).toBe(true)
    await call(harness, 'archive_threads', { threadIds: ['t2'], archived: false })
    expect(harness.state.threads[1].archived).toBe(false)
  })
})

describe('delete_threads', () => {
  it('never deletes the calling thread, even when explicitly listed', async () => {
    const harness = createHarness({ threads: [thread()] })
    const result = await call(harness, 'delete_threads', { threadIds: ['t1'] })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('never deleted')
    expect(harness.deps.confirm).not.toHaveBeenCalled()
  })

  it('stops streams and deletes after a confirmed verdict, then broadcasts', async () => {
    const harness = createHarness({
      threads: [thread(), thread({ id: 't2', title: 'Old chat' })],
      confirm: true
    })
    const result = await call(harness, 'delete_threads', { threadIds: ['t2'] })
    expect(result.isError).toBeUndefined()
    expect(harness.deps.confirm).toHaveBeenCalledWith({
      threadId: 't1',
      summary: expect.stringContaining('"Old chat"')
    })
    expect(harness.stopped).toEqual(['t2'])
    expect(harness.deleted).toEqual(['t2'])
    expect(harness.broadcasts()).toBe(1)
  })

  it('deletes nothing when the user declines', async () => {
    const harness = createHarness({
      threads: [thread(), thread({ id: 't2' })],
      confirm: false
    })
    const result = await call(harness, 'delete_threads', { threadIds: ['t2'] })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('did not confirm')
    expect(harness.deleted).toEqual([])
    expect(harness.stopped).toEqual([])
  })

  it('selects by olderThanDays from lastActivityAt', async () => {
    const now = Date.now()
    const harness = createHarness({
      threads: [
        thread({ lastActivityAt: now }),
        thread({ id: 'old', lastActivityAt: now - 40 * 86_400_000 }),
        thread({ id: 'fresh', lastActivityAt: now })
      ],
      confirm: true
    })
    await call(harness, 'delete_threads', { olderThanDays: 30 })
    expect(harness.deleted).toEqual(['old'])
  })

  it('requires ids or an age filter', async () => {
    const result = await call(createHarness(), 'delete_threads', {})
    expect(result.isError).toBe(true)
  })
})

describe('chat-connector confirm bridge', () => {
  it('resolves true when the renderer confirms and false for unknown ids', async () => {
    const sent: { requestId: string }[] = []
    setChatConnectorConfirmSender((request) => sent.push(request))
    const pending = requestChatConnectorConfirm({ threadId: 't1', summary: 'Delete 1 chat' })
    expect(sent).toHaveLength(1)
    expect(respondChatConnectorConfirm('nope', true)).toBe(false)
    expect(respondChatConnectorConfirm(sent[0].requestId, true)).toBe(true)
    await expect(pending).resolves.toBe(true)
    // A second answer for the same id is a no-op.
    expect(respondChatConnectorConfirm(sent[0].requestId, true)).toBe(false)
    setChatConnectorConfirmSender(null)
    clearChatConnectorConfirmsForTests()
  })

  it('denies when no sender is wired and when the timeout fires', async () => {
    vi.useFakeTimers()
    try {
      setChatConnectorConfirmSender(null)
      await expect(
        requestChatConnectorConfirm({ threadId: 't1', summary: 's' })
      ).resolves.toBe(false)
      setChatConnectorConfirmSender(() => undefined)
      const pending = requestChatConnectorConfirm({ threadId: 't1', summary: 's' })
      vi.advanceTimersByTime(120_001)
      await expect(pending).resolves.toBe(false)
    } finally {
      setChatConnectorConfirmSender(null)
      clearChatConnectorConfirmsForTests()
      vi.useRealTimers()
    }
  })
})

describe('workspace membership tools', () => {
  it('lists every workspace with counts and flags the caller\'s own', async () => {
    const harness = createHarness({
      workspaces: [workspace(), workspace({ id: 'w2', name: 'Acme', directories: [] })],
      threads: [thread(), thread({ id: 't2', workspaceId: null }), thread({ id: 't3', workspaceId: 'w2' })]
    })
    const result = await call(harness, 'list_workspaces')
    const payload = JSON.parse(result.content[0]!.text)
    expect(payload.standaloneChatCount).toBe(1)
    expect(payload.workspaces).toEqual([
      expect.objectContaining({ id: 'w1', threadCount: 1, isCurrentWorkspace: true }),
      expect.objectContaining({ id: 'w2', name: 'Acme', threadCount: 1 })
    ])
  })

  it('moves an ungrouped chat into a workspace named by the user', async () => {
    const harness = createHarness({
      workspaces: [workspace({ id: 'w2', name: 'Acme' })],
      threads: [thread({ workspaceId: null, title: 'Quoting new work' })]
    })
    const result = await call(harness, 'move_chat_to_workspace', { workspaceName: 'acme' })
    expect(result.isError).toBeUndefined()
    expect(harness.state.threads[0]!.workspaceId).toBe('w2')
    expect(harness.broadcasts()).toBe(1)
    // The caveat has to survive: the running session keeps its original brief.
    expect(result.content[0]!.text).toContain('relaunched')
  })

  it('ungroups a chat when the target is explicitly null', async () => {
    const harness = createHarness()
    const result = await call(harness, 'move_chat_to_workspace', { workspaceId: null })
    expect(result.isError).toBeUndefined()
    expect(harness.state.threads[0]!.workspaceId).toBeNull()
  })

  it('refuses an ambiguous name instead of guessing a workspace', async () => {
    const harness = createHarness({
      workspaces: [workspace({ id: 'w1', name: 'Acme' }), workspace({ id: 'w2', name: 'acme' })],
      threads: [thread({ workspaceId: null })]
    })
    const result = await call(harness, 'move_chat_to_workspace', { workspaceName: 'Acme' })
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain('More than one workspace')
    expect(harness.state.threads[0]!.workspaceId).toBeNull()
  })

  it('reports an unknown target and leaves the chat where it is', async () => {
    const harness = createHarness({ threads: [thread({ workspaceId: null })] })
    const result = await call(harness, 'move_chat_to_workspace', { workspaceName: 'Nope' })
    expect(result.isError).toBe(true)
    expect(harness.state.threads[0]!.workspaceId).toBeNull()
    expect(harness.broadcasts()).toBe(0)
  })

  it('treats a move to the current workspace as a no-op', async () => {
    const harness = createHarness()
    const result = await call(harness, 'move_chat_to_workspace', { workspaceId: 'w1' })
    expect(result.isError).toBeUndefined()
    expect(result.content[0]!.text).toContain('already in')
    expect(harness.broadcasts()).toBe(0)
  })

  it('promotes an ungrouped chat into a brand new workspace', async () => {
    const harness = createHarness({ threads: [thread({ workspaceId: null })] })
    const result = await call(harness, 'create_workspace_from_chat', { name: 'Roads Australia' })
    expect(result.isError).toBeUndefined()
    const created = harness.state.workspaces.find((w) => w.name === 'Roads Australia')
    expect(created).toBeDefined()
    expect(harness.state.threads[0]!.workspaceId).toBe(created!.id)
  })

  it('inherits the current workspace folders when none are given', async () => {
    const harness = createHarness()
    await call(harness, 'create_workspace_from_chat', { name: 'Split out' })
    const created = harness.state.workspaces.find((w) => w.name === 'Split out')
    expect(created?.directories).toEqual(['/sites/client'])
  })

  it('rejects folders that do not exist rather than creating a broken workspace', async () => {
    const harness = createHarness({ threads: [thread({ workspaceId: null })] })
    const result = await call(harness, 'create_workspace_from_chat', {
      name: 'Bad',
      directories: ['/nope']
    })
    expect(result.isError).toBe(true)
    expect(harness.state.workspaces.some((w) => w.name === 'Bad')).toBe(false)
  })

  it('can create a workspace without moving the chat into it', async () => {
    const harness = createHarness()
    const result = await call(harness, 'create_workspace_from_chat', {
      name: 'Later',
      moveChat: false
    })
    expect(result.isError).toBeUndefined()
    expect(harness.state.threads[0]!.workspaceId).toBe('w1')
    expect(harness.state.workspaces.some((w) => w.name === 'Later')).toBe(true)
  })

  it('requires a name', async () => {
    const harness = createHarness()
    const result = await call(harness, 'create_workspace_from_chat', { name: '  ' })
    expect(result.isError).toBe(true)
  })
})
