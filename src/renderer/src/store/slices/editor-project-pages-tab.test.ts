import { createStore, type StoreApi } from 'zustand/vanilla'
import { describe, expect, it, vi } from 'vitest'
import { createEditorSlice } from './editor'
import { createTabsSlice } from './tabs'
import type { AppState } from '../types'

const TAB_ID = 'wt-1::project-pages'

function createStoreWithTabs(): StoreApi<AppState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createStore<any>()((...args: any[]) => ({
    activeWorktreeId: 'wt-1',
    tabsByWorktree: {},
    browserTabsByWorktree: {},
    activeBrowserTabId: null,
    activeBrowserTabIdByWorktree: {},
    repos: [{ id: 'repo-1', path: '/repo' }],
    worktreesByRepo: { 'repo-1': [{ id: 'wt-1', repoId: 'repo-1', path: '/repo' }] },
    folderWorkspaces: [],
    projectGroups: [],
    recordFeatureInteraction: vi.fn(),
    ...createTabsSlice(...(args as Parameters<typeof createTabsSlice>)),
    ...createEditorSlice(...(args as Parameters<typeof createEditorSlice>))
  })) as unknown as StoreApi<AppState>
}

function pagesTabs(store: StoreApi<AppState>) {
  return (store.getState().unifiedTabsByWorktree['wt-1'] ?? []).filter(
    (tab) => tab.contentType === 'project-pages'
  )
}

describe('project pages tab', () => {
  it('opens one Pages tab per worktree and makes it active', () => {
    const store = createStoreWithTabs()
    store.getState().openProjectPagesTab('wt-1', 'repo:repo-1', 'page-a')

    const file = store.getState().openFiles.find((f) => f.id === TAB_ID)
    expect(file).toMatchObject({
      mode: 'project-pages',
      relativePath: 'Pages',
      projectPages: { scopeKey: 'repo:repo-1', pageId: 'page-a', request: 1 }
    })
    expect(store.getState().activeFileId).toBe(TAB_ID)
    expect(store.getState().activeTabType).toBe('editor')
    expect(pagesTabs(store)).toHaveLength(1)
  })

  it('reuses the tab and bumps the request when another page is opened', () => {
    const store = createStoreWithTabs()
    store.getState().openProjectPagesTab('wt-1', 'repo:repo-1', 'page-a')
    store.getState().openFile({
      filePath: '/repo/other.ts',
      relativePath: 'other.ts',
      worktreeId: 'wt-1',
      language: 'typescript',
      mode: 'edit'
    })
    store.getState().openProjectPagesTab('wt-1', 'repo:repo-1', 'page-a')

    const file = store.getState().openFiles.find((f) => f.id === TAB_ID)
    expect(file?.projectPages).toMatchObject({ pageId: 'page-a', request: 2 })
    expect(store.getState().activeFileId).toBe(TAB_ID)
    expect(pagesTabs(store)).toHaveLength(1)
  })

  it('retitles the tab with the page it shows without taking focus', () => {
    const store = createStoreWithTabs()
    store.getState().openProjectPagesTab('wt-1', 'repo:repo-1', null)
    store.getState().openFile({
      filePath: '/repo/other.ts',
      relativePath: 'other.ts',
      worktreeId: 'wt-1',
      language: 'typescript',
      mode: 'edit'
    })
    store.getState().showProjectPagesTabPage(TAB_ID, 'page-b', 'Site map')

    const file = store.getState().openFiles.find((f) => f.id === TAB_ID)
    expect(file).toMatchObject({ relativePath: 'Pages: Site map' })
    expect(file?.projectPages).toMatchObject({ pageId: 'page-b', request: 1 })
    expect(pagesTabs(store)[0]?.label).toBe('Pages: Site map')
    expect(store.getState().activeFileId).not.toBe(TAB_ID)
  })
})

describe('project pages review', () => {
  function openOther(store: StoreApi<AppState>): void {
    store.getState().openFile({
      filePath: '/repo/other.ts',
      relativePath: 'other.ts',
      worktreeId: 'wt-1',
      language: 'typescript',
      mode: 'edit'
    })
  }

  it('opens the page in a background Pages tab with a review dot', () => {
    const store = createStoreWithTabs()
    openOther(store)
    store.getState().openProjectPagesReview('wt-1', 'repo:repo-1', 'page-r')

    const file = store.getState().openFiles.find((f) => f.id === TAB_ID)
    expect(file?.projectPages).toMatchObject({ pageId: 'page-r' })
    expect(store.getState().activeFileId).not.toBe(TAB_ID)
    expect(pagesTabs(store)[0]?.attention).toBe('review')
  })

  it('leaves a Pages tab the person is reading on its page', () => {
    const store = createStoreWithTabs()
    store.getState().openProjectPagesTab('wt-1', 'repo:repo-1', 'page-a')
    store.getState().openProjectPagesReview('wt-1', 'repo:repo-1', 'page-r')

    const file = store.getState().openFiles.find((f) => f.id === TAB_ID)
    expect(file?.projectPages).toMatchObject({ pageId: 'page-a' })
    expect(pagesTabs(store)[0]?.attention).toBe('review')
  })

  it('moves a Pages tab in the background to the review page', () => {
    const store = createStoreWithTabs()
    store.getState().openProjectPagesTab('wt-1', 'repo:repo-1', 'page-a')
    openOther(store)
    store.getState().openProjectPagesReview('wt-1', 'repo:repo-1', 'page-r')

    const file = store.getState().openFiles.find((f) => f.id === TAB_ID)
    expect(file?.projectPages).toMatchObject({ pageId: 'page-r', request: 2 })
    expect(store.getState().activeFileId).not.toBe(TAB_ID)
  })
})
