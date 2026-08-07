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
        { id: 'w1', name: 'Site', directories: ['/a', 7, ''], createdAt: 1, updatedAt: 1 },
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
    expect(state.threads.map((t) => t.id)).toEqual(['t1'])
    expect(state.threads[0]?.claudeSessionId).toBeNull()
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

  it('round-trips through flush and a fresh load', () => {
    const store = new ChatWorkspaceStore(dir, () => 7)
    const workspace = store.createWorkspace({ name: 'Site', directories: ['/a', '/b'] })
    store.createThread({ workspaceId: workspace.id, title: 'First' })
    store.flush()

    const reloaded = new ChatWorkspaceStore(dir)
    expect(reloaded.getState().workspaces[0]?.directories).toEqual(['/a', '/b'])
    expect(reloaded.getState().threads[0]?.title).toBe('First')
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
