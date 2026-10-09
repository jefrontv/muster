// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GitStatusEntry } from '../../../../shared/types'
import {
  bulkStageRuntimeGitPaths,
  stageRuntimeGitPath,
  unstageRuntimeGitPath
} from '@/runtime/runtime-git-client'
import SourceControl from './SourceControl'
import { SOURCE_CONTROL_FILE_ROW_HEIGHT_PX } from './source-control-virtual-file-list'

const mocks = vi.hoisted(() => {
  const activeRepo = {
    id: 'repo-1',
    path: '/repo',
    displayName: 'Repo',
    badgeColor: '#000',
    addedAt: 0
  }
  const activeWorktree = {
    id: 'wt-1',
    repoId: 'repo-1',
    path: '/repo/wt',
    head: 'abcdef123',
    branch: 'refs/heads/feature/virtual-list',
    isBare: false,
    isMainWorktree: false,
    displayName: 'feature/virtual-list',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGitLabMR: null,
    linkedGitLabIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
  return {
    activeRepo,
    activeWorktree,
    state: {} as Record<string, unknown>
  }
})

vi.mock('@/store', () => {
  const useAppStore = Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) =>
      selector ? selector(mocks.state) : mocks.state,
    {
      getState: () => mocks.state
    }
  )
  return { useAppStore }
})

vi.mock('@/store/selectors', () => ({
  useActiveWorktree: () => mocks.activeWorktree,
  useRepoById: (repoId: string | null) =>
    repoId === mocks.activeRepo.id ? mocks.activeRepo : null,
  useWorktreeMap: () => new Map([[mocks.activeWorktree.id, mocks.activeWorktree]])
}))

vi.mock('@/components/confirmation-dialog', () => ({
  useConfirmationDialog: () => vi.fn().mockResolvedValue(true)
}))

vi.mock('./git-status-refresh', () => ({
  refreshGitStatusForWorktree: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('@/runtime/runtime-git-client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  stageRuntimeGitPath: vi.fn().mockResolvedValue(undefined),
  unstageRuntimeGitPath: vi.fn().mockResolvedValue(undefined),
  bulkStageRuntimeGitPaths: vi.fn().mockResolvedValue(undefined)
}))

const VIEWPORT_HEIGHT_PX = 600

function gitEntry(overrides: Partial<GitStatusEntry>): GitStatusEntry {
  return {
    path: 'src/file.ts',
    area: 'unstaged',
    status: 'modified',
    added: 1,
    removed: 0,
    ...overrides
  }
}

function manyEntries(count: number): GitStatusEntry[] {
  return Array.from({ length: count }, (_, index) =>
    gitEntry({ path: `src/file-${String(index).padStart(3, '0')}.ts` })
  )
}

function noopAsync(value: unknown = undefined): () => Promise<unknown> {
  return vi.fn().mockResolvedValue(value)
}

function resetState(overrides: Partial<Record<string, unknown>> = {}): void {
  vi.clearAllMocks()
  mocks.state = {
    activeWorktreeId: mocks.activeWorktree.id,
    activeGroupIdByWorktree: { [mocks.activeWorktree.id]: 'group-1' },
    groupsByWorktree: { [mocks.activeWorktree.id]: [{ id: 'group-1', activeTabId: null }] },
    repos: [mocks.activeRepo],
    worktreesByRepo: { [mocks.activeRepo.id]: [mocks.activeWorktree] },
    rightSidebarOpen: false,
    rightSidebarTab: 'source-control',
    gitStatusByWorktree: { [mocks.activeWorktree.id]: [] },
    gitBranchChangesByWorktree: { [mocks.activeWorktree.id]: [] },
    gitBranchCompareSummaryByWorktree: { [mocks.activeWorktree.id]: null },
    gitConflictOperationByWorktree: {},
    remoteStatusesByWorktree: {},
    isRemoteOperationActive: false,
    inFlightRemoteOpKind: null,
    settings: null,
    hostedReviewCache: {},
    prCache: {},
    commitMessageGenerationRecords: {},
    pullRequestGenerationRecords: {},
    openFiles: [],
    activeFileIdByWorktree: {},
    activeTabTypeByWorktree: {},
    getDiffComments: vi.fn(() => []),
    updateSettings: noopAsync(),
    openSettingsTarget: vi.fn(),
    openSettingsPage: vi.fn(),
    fetchHostedReviewForBranch: noopAsync(),
    getHostedReviewCreationEligibility: noopAsync(null),
    createHostedReview: noopAsync({ ok: false, error: 'not available' }),
    updateWorktreeMeta: noopAsync(),
    fetchPRForBranch: noopAsync(),
    enqueueGitHubPRRefresh: vi.fn(),
    updateRepo: noopAsync(),
    setGitStatus: vi.fn(),
    updateWorktreeGitIdentity: vi.fn(),
    beginGitBranchCompareRequest: vi.fn(() => 'request-key'),
    setGitBranchCompareResult: vi.fn(),
    clearGitBranchCompare: vi.fn(),
    fetchUpstreamStatus: noopAsync(),
    setUpstreamStatus: vi.fn(),
    pushBranch: noopAsync(),
    pullBranch: noopAsync(),
    fastForwardBranch: noopAsync(),
    syncBranch: noopAsync(),
    rebaseFromBase: noopAsync(),
    fetchBranch: noopAsync(),
    revealInExplorer: vi.fn(),
    trackConflictPath: vi.fn(),
    openDiff: vi.fn(),
    openFile: vi.fn(),
    setEditorViewMode: vi.fn(),
    setMarkdownViewMode: vi.fn(),
    setPendingEditorReveal: vi.fn(),
    openConflictFile: vi.fn(),
    openConflictReview: vi.fn(),
    openBranchDiff: vi.fn(),
    createEmptySplitGroup: vi.fn(() => 'group-2'),
    openAllDiffs: vi.fn(),
    openBranchAllDiffs: vi.fn(),
    openCommitAllDiffs: vi.fn(),
    deleteDiffComment: noopAsync(true),
    clearDiffComments: noopAsync(true),
    clearDiffCommentsForFile: noopAsync(true),
    setScrollToDiffCommentId: vi.fn(),
    setRightSidebarOpen: vi.fn(),
    setRightSidebarTab: vi.fn(),
    allocateCommitMessageGenerationRequestId: vi.fn(() => 'commit-generation-1'),
    setCommitMessageGenerationRecord: vi.fn(),
    updateCommitMessageGenerationRecord: vi.fn(),
    pruneCommitMessageGenerationRecords: vi.fn(),
    allocatePullRequestGenerationRequestId: vi.fn(() => 'pr-generation-1'),
    setPullRequestGenerationRecord: vi.fn(),
    updatePullRequestGenerationRecord: vi.fn(),
    prunePullRequestGenerationRecords: vi.fn(),
    ...overrides
  }
}

let container: HTMLDivElement
let root: Root

class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  resetState()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  // Why: happy-dom has no layout. Give the virtualizer a 600px scroll viewport
  // and 24px rows (both rect + row measurement read offsetHeight), and keep
  // the observer path inert so measurements stay deterministic.
  vi.stubGlobal('ResizeObserver', NoopResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains('overflow-auto')
        ? VIEWPORT_HEIGHT_PX
        : SOURCE_CONTROL_FILE_ROW_HEIGHT_PX
    }
  )
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    // The panel scroller acts as the fixed viewport; everything inside it
    // shifts up by scrollTop, which is what the list's scroll-margin math
    // reads. Leaf rows only ever contribute their 24px height.
    const isScroller = this.classList.contains('overflow-auto')
    const scroller = isScroller ? null : this.closest('.overflow-auto')
    const top = isScroller ? 0 : -(scroller?.scrollTop ?? 0)
    return {
      top,
      bottom: top + SOURCE_CONTROL_FILE_ROW_HEIGHT_PX,
      height: SOURCE_CONTROL_FILE_ROW_HEIGHT_PX,
      left: 0,
      right: 240,
      width: 240,
      x: 0,
      y: top,
      toJSON: () => ({})
    } as DOMRect
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderSourceControl(): void {
  act(() => {
    root.render(
      <TooltipProvider>
        <SourceControl />
      </TooltipProvider>
    )
  })
}

function scroller(): HTMLDivElement {
  const element = container.querySelector<HTMLDivElement>('.overflow-auto')
  if (!element) {
    throw new Error('source control scroller not found')
  }
  return element
}

function scrollTo(offset: number): void {
  const element = scroller()
  // Why: happy-dom clamps scrollTop against its zero-height layout; pin the
  // property so the virtualizer's scroll handler reads the intended offset.
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    writable: true,
    value: offset
  })
  act(() => {
    element.dispatchEvent(new Event('scroll'))
  })
}

function row(path: string, area = 'unstaged'): HTMLDivElement | null {
  return container.querySelector<HTMLDivElement>(
    `[data-source-control-path="${path}"][data-source-control-area="${area}"]`
  )
}

function tree(): HTMLElement {
  const element = container.querySelector<HTMLElement>('[role="tree"]')
  if (!element) {
    throw new Error('tree not found')
  }
  return element
}

function press(target: Element, key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    )
  })
}

function focus(target: HTMLElement | null): HTMLElement {
  if (!target) {
    throw new Error('focus target missing')
  }
  act(() => target.focus())
  return target
}

describe('SourceControl changed-files keyboard tree', () => {
  it('exposes rows as labelled treeitems with one tab stop', () => {
    resetState({
      gitStatusByWorktree: {
        [mocks.activeWorktree.id]: [
          gitEntry({ path: 'b.txt', area: 'staged', status: 'added' }),
          gitEntry({ path: 'src/a.ts' })
        ]
      }
    })
    renderSourceControl()

    expect(tree().getAttribute('aria-label')).toBe('Changed files')
    const staged = row('b.txt', 'staged')
    expect(staged?.getAttribute('role')).toBe('treeitem')
    expect(staged?.getAttribute('aria-label')).toBe('b.txt, added, staged')
    expect(staged?.getAttribute('aria-level')).toBe('2')
    const items = Array.from(tree().querySelectorAll('[role="treeitem"]'))
    expect(items.filter((item) => item.getAttribute('tabindex') === '0')).toHaveLength(1)
    const headers = items.filter((item) => item.getAttribute('aria-level') === '1')
    expect(headers.length).toBe(2)
    expect(headers.every((header) => header.getAttribute('aria-expanded') === 'true')).toBe(true)
    // Why: nested hover buttons must not add tab stops inside the tree.
    expect(
      Array.from(tree().querySelectorAll('button')).every(
        (button) => button.getAttribute('tabindex') === '-1'
      )
    ).toBe(true)
  })

  it('opens, stages and discards the focused row from the keyboard', async () => {
    resetState({
      gitStatusByWorktree: { [mocks.activeWorktree.id]: [gitEntry({ path: 'src/a.ts' })] }
    })
    renderSourceControl()

    const target = focus(row('src/a.ts'))
    press(target, 'Enter')
    expect(mocks.state.openDiff).toHaveBeenCalled()

    press(target, ' ')
    await vi.waitFor(() =>
      expect(stageRuntimeGitPath).toHaveBeenCalledWith(expect.anything(), 'src/a.ts')
    )
    expect(unstageRuntimeGitPath).not.toHaveBeenCalled()

    press(target, 'Delete')
    expect(document.body.textContent).toContain('Discard changes to "a.ts"?')
  })

  it('collapses a section with ArrowLeft from its header', () => {
    resetState({
      gitStatusByWorktree: { [mocks.activeWorktree.id]: [gitEntry({ path: 'src/a.ts' })] }
    })
    renderSourceControl()

    const file = focus(row('src/a.ts'))
    press(file, 'ArrowLeft')
    const header = document.activeElement as HTMLElement
    expect(header.getAttribute('aria-level')).toBe('1')
    press(header, 'ArrowLeft')
    expect(row('src/a.ts')).toBeNull()
    expect(header.getAttribute('aria-expanded')).toBe('false')
  })

  it('stages the whole selection from a selected row', async () => {
    resetState({
      gitStatusByWorktree: {
        [mocks.activeWorktree.id]: [gitEntry({ path: 'src/a.ts' }), gitEntry({ path: 'src/b.ts' })]
      }
    })
    renderSourceControl()

    // Why: plain Cmd/Ctrl-click opens a split, so the toggle gesture needs both modifiers.
    for (const path of ['src/a.ts', 'src/b.ts']) {
      act(() => {
        row(path)?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, metaKey: true, ctrlKey: true })
        )
      })
    }
    expect(container.textContent).toContain('2 selected')

    press(focus(row('src/b.ts')), ' ')
    await vi.waitFor(() =>
      expect(bulkStageRuntimeGitPaths).toHaveBeenCalledWith(expect.anything(), [
        'src/a.ts',
        'src/b.ts'
      ])
    )
    expect(stageRuntimeGitPath).not.toHaveBeenCalled()
  })

  it('keeps keyboard focus when the focused row is virtualised away and back', () => {
    resetState({
      gitStatusByWorktree: { [mocks.activeWorktree.id]: manyEntries(500) }
    })
    renderSourceControl()

    focus(row('src/file-000.ts'))
    scrollTo(240 * SOURCE_CONTROL_FILE_ROW_HEIGHT_PX)
    expect(row('src/file-000.ts')).toBeNull()
    expect(document.activeElement).toBe(tree())

    scrollTo(0)
    expect(document.activeElement).toBe(row('src/file-000.ts'))
  })

  it('scrolls the target of a keyboard move into the virtual window', () => {
    resetState({
      gitStatusByWorktree: { [mocks.activeWorktree.id]: manyEntries(500) }
    })
    renderSourceControl()

    expect(row('src/file-499.ts')).toBeNull()
    const scrollToSpy = vi.fn()
    scroller().scrollTo = scrollToSpy
    // Why: the virtualizer clamps targets to scrollHeight, which happy-dom reports as 0.
    Object.defineProperty(scroller(), 'scrollHeight', {
      configurable: true,
      value: 600 * SOURCE_CONTROL_FILE_ROW_HEIGHT_PX
    })
    press(focus(row('src/file-000.ts')), 'End')
    const lastCall = scrollToSpy.mock.calls.at(-1)?.[0] as ScrollToOptions | undefined
    expect(lastCall?.top).toBeGreaterThan(400 * SOURCE_CONTROL_FILE_ROW_HEIGHT_PX)
  })
})
