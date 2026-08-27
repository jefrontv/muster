import { describe, expect, it, vi } from 'vitest'
import {
  countRecordKeysByReference,
  getScrollTopToRevealBounds,
  resolvePendingSidebarReveal,
  WORKTREE_SIDEBAR_REVEAL_TOP_INSET,
  shouldAdjustWorktreeSidebarMeasuredRowScroll
} from './WorktreeList'
import {
  estimateRenderRowSize,
  GROUP_HEADER_ROW_HEIGHT,
  getActiveStickyHeaderIndexForScroll
} from './worktree-list-virtual-rows'
import type { Repo } from '../../../../shared/types'
import type { Row } from './worktree-list-groups'

const repo: Repo = {
  id: 'repo-1',
  path: '/repo',
  displayName: 'orca',
  badgeColor: '#000',
  addedAt: 1
}

const makeHeaderRow = (
  key: string,
  overrides: Partial<Extract<Row, { type: 'header' }>> = {}
): Extract<Row, { type: 'header' }> => ({
  type: 'header',
  key,
  label: key,
  count: 0,
  tone: 'text-foreground',
  ...overrides
})

const makeImportedCardRow = (): Extract<Row, { type: 'imported-worktrees-card' }> => ({
  type: 'imported-worktrees-card',
  key: 'imported-worktrees-card:repo-group:repo-1',
  repo,
  hiddenWorktrees: [],
  placement: 'repo-group'
})

const makeScrollContainer = (scrollTop: number, clientHeight: number): HTMLElement =>
  ({ scrollTop, clientHeight }) as HTMLElement

describe('shouldAdjustWorktreeSidebarMeasuredRowScroll', () => {
  it('counts record keys once per object reference', () => {
    const keysSpy = vi.spyOn(Object, 'keys')
    const first = { a: 1, b: 2 }
    const second = { ...first, c: 3 }

    try {
      expect(countRecordKeysByReference(first)).toBe(2)
      expect(countRecordKeysByReference(first)).toBe(2)
      expect(countRecordKeysByReference(second)).toBe(3)
      expect(keysSpy).toHaveBeenCalledTimes(2)
    } finally {
      keysSpy.mockRestore()
    }
  })

  it('suppresses measured-row scroll correction while TanStack is scrolling', () => {
    expect(
      shouldAdjustWorktreeSidebarMeasuredRowScroll({
        isScrolling: true,
        now: 1_000,
        suppressUntil: 0
      })
    ).toBe(false)
  })

  it('suppresses measured-row scroll correction during direct scroll input grace period', () => {
    expect(
      shouldAdjustWorktreeSidebarMeasuredRowScroll({
        isScrolling: false,
        now: 1_000,
        suppressUntil: 1_250
      })
    ).toBe(false)
  })

  it('allows measured-row scroll correction after direct scrolling settles', () => {
    expect(
      shouldAdjustWorktreeSidebarMeasuredRowScroll({
        isScrolling: false,
        now: 1_500,
        suppressUntil: 1_250
      })
    ).toBe(true)
  })

  it('keeps pending reveal requests when the worktree still exists but the row is unresolved', () => {
    expect(
      resolvePendingSidebarReveal({
        targetIndex: -1,
        targetWorktreeStillExists: true
      })
    ).toBe('keep-pending')
  })

  it('clears pending reveal requests once the target disappears', () => {
    expect(
      resolvePendingSidebarReveal({
        targetIndex: -1,
        targetWorktreeStillExists: false
      })
    ).toBe('clear')
  })

  it('scrolls and clears once the target row is resolvable', () => {
    expect(
      resolvePendingSidebarReveal({
        targetIndex: 4,
        targetWorktreeStillExists: true
      })
    ).toBe('scroll-and-clear')
  })
})

describe('getScrollTopToRevealBounds', () => {
  it('treats the top inset as occluding the viewport top', () => {
    const container = makeScrollContainer(100, 400)

    expect(
      getScrollTopToRevealBounds(
        container,
        {
          start: 100,
          end: 216
        },
        GROUP_HEADER_ROW_HEIGHT
      )
    ).toBe(72)
  })

  it('reserves only the reveal clearance now that no header pins', () => {
    const container = makeScrollContainer(100, 400)

    expect(
      getScrollTopToRevealBounds(
        container,
        {
          start: 100,
          end: 216
        },
        WORKTREE_SIDEBAR_REVEAL_TOP_INSET
      )
    ).toBe(94)
  })

  it('does not scroll when the bounds are below the top inset', () => {
    const container = makeScrollContainer(100, 400)

    expect(
      getScrollTopToRevealBounds(
        container,
        {
          start: 128,
          end: 244
        },
        GROUP_HEADER_ROW_HEIGHT
      )
    ).toBeNull()
  })

  it('keeps the viewport bottom independent of the top inset', () => {
    const container = makeScrollContainer(100, 400)

    expect(
      getScrollTopToRevealBounds(
        container,
        {
          start: 430,
          end: 520
        },
        GROUP_HEADER_ROW_HEIGHT
      )
    ).toBe(120)
  })
})

describe('estimateRenderRowSize', () => {
  it('sizes a secondary group header without inter-group spacing', () => {
    const rows = [makeHeaderRow('first'), makeHeaderRow('second')]

    expect(estimateRenderRowSize(rows, 1, 0)).toBe(32)
  })

  it('estimates imported worktree line rows with a stable compact height', () => {
    const rows = [makeHeaderRow('repo:repo-1'), makeImportedCardRow()]

    expect(estimateRenderRowSize(rows, 1, 0)).toBe(36)
  })

  it('keeps the previous header active until the secondary header row reaches the top', () => {
    expect(
      getActiveStickyHeaderIndexForScroll({
        rangeStartIndex: 1,
        scrollOffset: 99,
        stickyHeaderIndexes: [0, 1],
        virtualItems: [{ key: 'hdr:second', index: 1, start: 100, end: 136, size: 36, lane: 0 }]
      })
    ).toBe(0)
  })

  it('activates a secondary header as soon as its row reaches the top (no spacer dead zone)', () => {
    // Regression: the swap must fire when the header row reaches the top
    // (scrollOffset === start), not 8px later. Gating on start + spacer left
    // the previous repo's opaque header pinned over the incoming one.
    expect(
      getActiveStickyHeaderIndexForScroll({
        rangeStartIndex: 1,
        scrollOffset: 100,
        stickyHeaderIndexes: [0, 1],
        virtualItems: [{ key: 'hdr:second', index: 1, start: 100, end: 136, size: 36, lane: 0 }]
      })
    ).toBe(1)
  })
})
