import { createStore, type StoreApi } from 'zustand/vanilla'
import { describe, expect, it, vi } from 'vitest'
import { getDefaultUIState } from '../../../../shared/constants'
import { createUISlice } from '@/store/slices/ui'
import { createEditorSlice } from '@/store/slices/editor'
import { createWorktreeNavHistorySlice } from '@/store/slices/worktree-nav-history'
import { createSettingsSearchState } from '@/store/slices/settings-search-state'
import type { AppState } from '@/store/types'
import { createNarrowWindowCollapse } from './narrow-window-collapse'

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }))
vi.mock('sonner', () => ({ toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() } }))

function setup(initialWidth: number, initialOpen = true) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = createStore<any>()((...args: any[]) => ({
    repos: [],
    worktreesByRepo: {},
    ...createSettingsSearchState(args[0]),
    ...createWorktreeNavHistorySlice(...(args as Parameters<typeof createWorktreeNavHistorySlice>)),
    ...createUISlice(...(args as Parameters<typeof createUISlice>)),
    ...createEditorSlice(...(args as Parameters<typeof createEditorSlice>))
  })) as unknown as StoreApi<AppState>
  store.setState({ rightSidebarOpen: initialOpen })
  let width = initialWidth
  const onResize = createNarrowWindowCollapse({
    getWidth: () => width,
    setAutoFolded: (folded) => store.getState().setRightSidebarAutoFolded(folded)
  })
  onResize()
  const resize = (next: number): void => {
    width = next
    onResize()
  }
  const open = (): boolean => store.getState().rightSidebarOpen
  // What App persists, and what main echoes back through a sync hydrate.
  const saved = (): boolean => open() || store.getState().rightSidebarAutoFolded
  const syncHydrate = (rightSidebarOpen: boolean): void =>
    store.getState().hydratePersistedUI({ ...getDefaultUIState(), rightSidebarOpen }, 'sync')
  return { store, resize, open, saved, syncHydrate }
}

describe('narrow-window right sidebar fold', () => {
  it('folds below the breakpoint and restores on widening, every cycle', () => {
    const { resize, open } = setup(1400)
    for (let cycle = 0; cycle < 2; cycle++) {
      resize(800)
      expect(open()).toBe(false)
      resize(1400)
      expect(open()).toBe(true)
    }
  })

  it('folds when the window starts narrow', () => {
    const { open } = setup(800)
    expect(open()).toBe(false)
  })

  it('never saves a fold as the user closing the sidebar', () => {
    const { resize, saved } = setup(1400)
    resize(800)
    expect(saved()).toBe(true)
  })

  it('ignores the echo of its own save, before or after widening', () => {
    const { resize, open, saved, syncHydrate } = setup(1400)
    resize(800)
    syncHydrate(saved())
    expect(open()).toBe(false)
    resize(1400)
    syncHydrate(true)
    expect(open()).toBe(true)
    resize(800)
    expect(open()).toBe(false)
  })

  it('treats a synced close while folded as the user choosing closed', () => {
    const { resize, open, syncHydrate } = setup(1400)
    resize(800)
    syncHydrate(false)
    resize(1400)
    expect(open()).toBe(false)
  })

  it('keeps a user toggle made while narrow', () => {
    const { store, resize, open } = setup(1400)
    resize(800)
    store.getState().toggleRightSidebar()
    expect(open()).toBe(true)
    store.getState().toggleRightSidebar()
    resize(1400)
    expect(open()).toBe(false)
  })

  it('leaves a closed sidebar closed', () => {
    const { resize, open } = setup(1400, false)
    resize(800)
    resize(1400)
    expect(open()).toBe(false)
  })
})
