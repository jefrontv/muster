import { createStore, type StoreApi } from 'zustand/vanilla'
import { describe, expect, it, vi } from 'vitest'
import type { PersistedUIState } from '../../../../shared/types'
import { getDefaultUIState } from '../../../../shared/constants'
import { createUISlice } from './ui'
import { createWorktreeNavHistorySlice } from './worktree-nav-history'
import { createSettingsSearchState } from './settings-search-state'
import type { AppState } from '../types'

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }))
vi.mock('sonner', () => ({ toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() } }))

function createUIStore(experimentalBots: boolean): StoreApi<AppState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = createStore<any>()((...args: any[]) => ({
    repos: [],
    worktreesByRepo: {},
    rightSidebarOpen: false,
    rightSidebarWidth: 280,
    markdownTocPanelWidth: 240,
    rightSidebarTab: 'explorer',
    rightSidebarExplorerView: 'files',
    ...createSettingsSearchState(args[0]),
    ...createWorktreeNavHistorySlice(...(args as Parameters<typeof createWorktreeNavHistorySlice>)),
    ...createUISlice(...(args as Parameters<typeof createUISlice>))
  })) as unknown as StoreApi<AppState>
  store.setState({ settings: { experimentalBots } as AppState['settings'] })
  return store
}

function persisted(activeView: PersistedUIState['activeView']): PersistedUIState {
  return { ...getDefaultUIState(), activeView }
}

describe('createUISlice bots view', () => {
  it('ignores openBotsPage while the experiment is off', () => {
    const store = createUIStore(false)
    store.getState().openBotsPage()
    expect(store.getState().activeView).toBe('terminal')
  })

  it('opens Bots and returns to the Code view it came from', () => {
    const store = createUIStore(true)
    store.setState({ activeView: 'tasks' })
    store.getState().openBotsPage()
    expect(store.getState().activeView).toBe('bots')
    store.getState().closeBotsPage()
    expect(store.getState().activeView).toBe('tasks')
  })

  it('keeps the Code view when hopping between Chat and Bots', () => {
    const store = createUIStore(true)
    store.setState({ activeView: 'tasks' })
    store.getState().openChatPage()
    store.getState().openBotsPage()
    store.getState().openChatPage()
    store.getState().closeChatPage()
    expect(store.getState().activeView).toBe('tasks')
  })

  it('drops a persisted bots view when the experiment is off', () => {
    const store = createUIStore(false)
    store.getState().hydratePersistedUI(persisted('bots'), 'startup')
    expect(store.getState().activeView).toBe('terminal')
  })

  it('restores a persisted bots view when the experiment is on', () => {
    const store = createUIStore(true)
    store.getState().hydratePersistedUI(persisted('bots'), 'startup')
    expect(store.getState().activeView).toBe('bots')
  })
})
