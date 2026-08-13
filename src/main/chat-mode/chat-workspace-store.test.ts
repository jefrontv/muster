import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChatWorkspaceStore, normalizeChatModeState } from './chat-workspace-store'

describe('normalizeChatModeState', () => {
  it('returns the empty state for junk input', () => {
    expect(normalizeChatModeState(null)).toEqual({ version: 1, workspaces: [], threads: [] })
    expect(normalizeChatModeState('nope')).toEqual({ version: 1, workspaces: [], threads: [] })
  })

  it('drops malformed rows and threads pointing at missing workspaces', () => {
    const state = normalizeChatModeState({
      workspaces: [
        {
          id: 'w1',
          name: 'Site',
          directories: ['/a', 7, ''],
          urls: ['example.com', '', 'https://staging.example.com'],
          clientEmails: ['  Jane@Client.com ', 'nope', 'ops@client.com'],
          notes: '  WordPress  ',
          iconOverridden: true,
          createdAt: 1,
          updatedAt: 1
        },
        { name: 'no id' }
      ],
      threads: [
        { id: 't1', workspaceId: 'w1', title: 'Chat', createdAt: 1, lastActivityAt: 1 },
        { id: 't2', workspaceId: 'missing', title: 'Orphan' },
        { workspaceId: 'w1' }
      ]
    })
    expect(state.workspaces).toHaveLength(1)
    expect(state.workspaces[0]?.directories).toEqual(['/a'])
    expect(state.workspaces[0]?.urls).toEqual([
      'https://example.com/',
      'https://staging.example.com/'
    ])
    expect(state.workspaces[0]?.clientEmails).toEqual(['jane@client.com', 'ops@client.com'])
    expect(state.workspaces[0]?.notes).toBe('WordPress')
    expect(state.workspaces[0]?.iconOverridden).toBe(true)
    expect(state.threads.map((t) => t.id)).toEqual(['t1'])
    expect(state.threads[0]?.claudeSessionId).toBeNull()
  })

  it('keeps a workspace that has no project folder', () => {
    const state = normalizeChatModeState({
      workspaces: [{ id: 'w-empty', name: 'Inbox', directories: [], createdAt: 1, updatedAt: 1 }],
      threads: []
    })
    expect(state.workspaces).toHaveLength(1)
    expect(state.workspaces[0]?.directories).toEqual([])
  })

  it('loads old JSON without visit/completion stamps and drops malformed ones', () => {
    const state = normalizeChatModeState({
      workspaces: [],
      threads: [
        { id: 'old', workspaceId: null, title: 'Old', createdAt: 1, lastActivityAt: 1 },
        {
          id: 'bad',
          workspaceId: null,
          title: 'Bad stamps',
          createdAt: 1,
          lastActivityAt: 1,
          lastVisitedAt: 'yesterday',
          lastCompletedAt: null
        },
        {
          id: 'new',
          workspaceId: null,
          title: 'New',
          createdAt: 1,
          lastActivityAt: 1,
          lastVisitedAt: 5,
          lastCompletedAt: 9
        }
      ]
    })
    expect(state.threads[0]).not.toHaveProperty('lastVisitedAt')
    expect(state.threads[0]).not.toHaveProperty('lastCompletedAt')
    expect(state.threads[1]).not.toHaveProperty('lastVisitedAt')
    expect(state.threads[1]).not.toHaveProperty('lastCompletedAt')
    expect(state.threads[2]?.lastVisitedAt).toBe(5)
    expect(state.threads[2]?.lastCompletedAt).toBe(9)
  })
})

describe('ChatWorkspaceStore', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'chat-store-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates, updates, and deletes workspaces with thread cascade', () => {
    const store = new ChatWorkspaceStore(dir, () => 42)
    const workspace = store.createWorkspace({ name: 'Site', directories: ['/a'] })
    const thread = store.createThread({ workspaceId: workspace.id })
    expect(thread?.workspaceId).toBe(workspace.id)

    store.updateThread(thread!.id, { claudeSessionId: 'sess-1', transcriptPath: '/t.jsonl' })
    expect(store.getState().threads[0]?.claudeSessionId).toBe('sess-1')

    store.deleteWorkspace(workspace.id)
    expect(store.getState().workspaces).toHaveLength(0)
    expect(store.getState().threads).toHaveLength(0)
  })

  it('refuses threads for unknown workspaces', () => {
    const store = new ChatWorkspaceStore(dir)
    expect(store.createThread({ workspaceId: 'nope' })).toBeNull()
  })

  it('creates and reloads a workspace with no project folder', () => {
    const store = new ChatWorkspaceStore(dir, () => 3)
    const workspace = store.createWorkspace({ name: 'Inbox', directories: [] })
    expect(workspace.directories).toEqual([])
    store.createThread({ workspaceId: workspace.id, title: 'Chat' })
    store.flush()

    const reloaded = new ChatWorkspaceStore(dir)
    expect(reloaded.getState().workspaces[0]?.directories).toEqual([])
    expect(reloaded.getState().threads[0]?.workspaceId).toBe(workspace.id)
  })

  it('round-trips through flush and a fresh load', () => {
    const store = new ChatWorkspaceStore(dir, () => 7)
    const workspace = store.createWorkspace({ name: 'Site', directories: ['/a', '/b'] })
    store.createThread({ workspaceId: workspace.id, title: 'First' })
    store.flush()

    const reloaded = new ChatWorkspaceStore(dir)
    expect(reloaded.getState().workspaces[0]?.directories).toEqual(['/a', '/b'])
    expect(reloaded.getState().threads[0]?.title).toBe('First')
  })

  it('persists urls, notes, and icon override, and can clear them', () => {
    const store = new ChatWorkspaceStore(dir, () => 7)
    const workspace = store.createWorkspace({ name: 'Site', directories: ['/a'] })
    store.updateWorkspace(workspace.id, {
      urls: ['example.com', 'https://staging.example.com'],
      clientEmails: ['Jane@Client.com', 'ops@client.com'],
      notes: '  WordPress  ',
      iconOverridden: true
    })
    store.flush()

    const reloaded = new ChatWorkspaceStore(dir)
    expect(reloaded.getState().workspaces[0]?.urls).toEqual([
      'https://example.com/',
      'https://staging.example.com/'
    ])
    expect(reloaded.getState().workspaces[0]?.clientEmails).toEqual([
      'jane@client.com',
      'ops@client.com'
    ])
    expect(reloaded.getState().workspaces[0]?.notes).toBe('WordPress')
    expect(reloaded.getState().workspaces[0]?.iconOverridden).toBe(true)
    reloaded.updateWorkspace(workspace.id, {
      activeCollabProjects: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' }
      ]
    })
    expect(reloaded.getState().workspaces[0]?.activeCollabProjects?.map((p) => p.id)).toEqual([
      1, 2
    ])
    expect(reloaded.getState().workspaces[0]?.activeCollabProject?.id).toBe(1)
    reloaded.flush()
    expect(
      new ChatWorkspaceStore(dir).getState().workspaces[0]?.activeCollabProjects?.map((p) => p.id)
    ).toEqual([1, 2])

    reloaded.updateWorkspace(workspace.id, {
      urls: [],
      clientEmails: [],
      notes: '',
      iconOverridden: false
    })
    reloaded.flush()
    const cleared = new ChatWorkspaceStore(dir).getState().workspaces[0]
    expect(cleared).not.toHaveProperty('urls')
    expect(cleared).not.toHaveProperty('clientEmails')
    expect(cleared).not.toHaveProperty('notes')
    expect(cleared).not.toHaveProperty('iconOverridden')
  })

  it('persists visit/completion stamps through updateThread and reload', () => {
    const store = new ChatWorkspaceStore(dir, () => 7)
    const thread = store.createThread({ workspaceId: null, title: 'Stamped' })
    store.updateThread(thread!.id, { lastVisitedAt: 11, lastCompletedAt: 22 })
    store.flush()

    const reloaded = new ChatWorkspaceStore(dir)
    expect(reloaded.getState().threads[0]?.lastVisitedAt).toBe(11)
    expect(reloaded.getState().threads[0]?.lastCompletedAt).toBe(22)
  })

  it('survives a corrupt store file', () => {
    writeFileSync(join(dir, 'chat-workspaces.json'), '{not json', 'utf-8')
    const store = new ChatWorkspaceStore(dir)
    expect(store.getState()).toEqual({ version: 1, workspaces: [], threads: [] })
    store.createWorkspace({ name: 'Recovered', directories: ['/x'] })
    store.flush()
    expect(
      JSON.parse(readFileSync(join(dir, 'chat-workspaces.json'), 'utf-8')).workspaces
    ).toHaveLength(1)
  })
})
