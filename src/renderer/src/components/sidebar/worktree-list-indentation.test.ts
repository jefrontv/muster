import { describe, expect, it } from 'vitest'
import {
  FLUSH_CARD_CONTENT_PULLBACK,
  FLUSH_CARD_MIN_CONTENT_INSET,
  NEW_CARD_STYLE_LINEAGE_CHILD_CONTENT_INDENT,
  LINEAGE_CHILDREN_INLINE_OFFSET,
  LINEAGE_IMMEDIATE_PARENT_STEP,
  LINEAGE_NESTED_ROW_SURFACE_INSET,
  WORKTREE_CARD_SURFACE_MARGIN,
  WORKTREE_SECTION_HEADER_PADDING_LEFT,
  getFolderBackedRepoWorktreeCardContentIndent,
  getFolderBackedRepoWorktreeCardSurfaceInset,
  getFolderWorkspaceCardContentIndent,
  getFolderWorkspaceCardSurfaceInset,
  getFolderWorkspaceRowGeometry,
  getFlushWorktreeCardPaddingLeft,
  getLineageChildrenInlineStyle,
  getLineageEffectiveChildStart,
  getLineageNestedRowGeometry,
  getProjectGroupHeaderPaddingLeft,
  getWorktreeCardContentIndent,
  getWorktreeCardSurfaceInset
} from './worktree-list-indentation'
import {
  SIDEBAR_LIST_INSET,
  SIDEBAR_ROW_STEP,
  WORKTREE_CARD_SURFACE_BORDER,
  getSidebarGlyphX,
  getSidebarTextX
} from './sidebar-row-grid'

function getFlushCardContentStart(args: {
  surfaceInset: number
  cardContentIndent: number
}): number {
  return (
    args.surfaceInset +
    WORKTREE_CARD_SURFACE_MARGIN +
    Math.max(FLUSH_CARD_MIN_CONTENT_INSET, args.cardContentIndent - FLUSH_CARD_CONTENT_PULLBACK)
  )
}

// Sidebar-edge x of a new-style card's status glyph (or title, without a status lane).
function getNewStyleCardLeadX(
  geometry: { surfaceInset: number; cardContentIndent: number },
  hasStatusLane = true
): number {
  return (
    SIDEBAR_LIST_INSET +
    geometry.surfaceInset +
    WORKTREE_CARD_SURFACE_MARGIN +
    WORKTREE_CARD_SURFACE_BORDER +
    Number.parseFloat(
      getFlushWorktreeCardPaddingLeft(geometry.cardContentIndent, hasStatusLane, true)
    )
  )
}

function getNewStyleRowGeometry(args: {
  isGrouped: boolean
  groupDepth: number
  lineageDepth: number
}): { surfaceInset: number; cardContentIndent: number } {
  const surfaceInset = getWorktreeCardSurfaceInset({
    ...args,
    experimentalNewWorktreeCardStyle: true
  })
  const contentIndent = getWorktreeCardContentIndent({
    ...args,
    experimentalNewWorktreeCardStyle: true
  })
  return { surfaceInset, cardContentIndent: contentIndent - surfaceInset }
}

describe('worktree list indentation', () => {
  it('keeps ungrouped workspaces flush with the list', () => {
    expect(getWorktreeCardContentIndent({ isGrouped: false, groupDepth: 4, lineageDepth: 0 })).toBe(
      0
    )
  })

  it('keeps ungrouped lineage indentation on the base tree step', () => {
    expect(getWorktreeCardContentIndent({ isGrouped: false, groupDepth: 4, lineageDepth: 2 })).toBe(
      36
    )
  })

  it('indents workspace content one step deeper than its containing project header', () => {
    expect(getWorktreeCardContentIndent({ isGrouped: true, groupDepth: 0, lineageDepth: 0 })).toBe(
      20
    )
    expect(getWorktreeCardContentIndent({ isGrouped: true, groupDepth: 1, lineageDepth: 0 })).toBe(
      38
    )
  })

  it('adds lineage depth after project/group depth', () => {
    expect(getWorktreeCardContentIndent({ isGrouped: true, groupDepth: 1, lineageDepth: 2 })).toBe(
      74
    )
  })

  it('uses compact header rhythm for folder-scanned repo worktree content', () => {
    expect(getFolderBackedRepoWorktreeCardContentIndent({ groupDepth: 1, lineageDepth: 0 })).toBe(
      30
    )
    expect(getFolderBackedRepoWorktreeCardContentIndent({ groupDepth: 2, lineageDepth: 0 })).toBe(
      40
    )
    expect(getFolderBackedRepoWorktreeCardContentIndent({ groupDepth: 1, lineageDepth: 1 })).toBe(
      48
    )
  })

  it('caps folder-scanned repo worktree surfaces before they overshoot the compact anchor', () => {
    expect(getFolderBackedRepoWorktreeCardSurfaceInset({ groupDepth: 1, lineageDepth: 0 })).toBe(14)
    expect(getFolderBackedRepoWorktreeCardSurfaceInset({ groupDepth: 4, lineageDepth: 0 })).toBe(54)
    expect(getFolderBackedRepoWorktreeCardSurfaceInset({ groupDepth: 4, lineageDepth: 1 })).toBe(56)
  })

  it('keeps folder workspace content one step under its owning group', () => {
    expect(getFolderWorkspaceCardContentIndent({ groupDepth: 1 })).toBe(20)
    expect(getFolderWorkspaceCardContentIndent({ groupDepth: 2 })).toBe(30)
  })

  it('caps folder workspace surfaces before they overshoot the compact content anchor', () => {
    expect(getFolderWorkspaceCardSurfaceInset({ isGrouped: true, groupDepth: 1 })).toBe(14)
    expect(getFolderWorkspaceCardSurfaceInset({ isGrouped: true, groupDepth: 2 })).toBe(24)
    expect(getFolderWorkspaceCardSurfaceInset({ isGrouped: false, groupDepth: 2 })).toBe(0)
  })

  it('preserves legacy folder-scanned folder workspace row geometry', () => {
    const geometry = getFolderWorkspaceRowGeometry({
      experimentalNewWorktreeCardStyle: false,
      isFolderBackedWorkspaceChild: true,
      isGrouped: true,
      groupDepth: 1,
      lineageDepth: 0
    })

    expect(geometry).toEqual({
      surfaceInset: 14,
      cardContentIndent: 6
    })
    expect(getFlushCardContentStart(geometry)).toBe(20)
  })

  it('preserves legacy nested folder-scanned folder workspace row geometry', () => {
    const geometry = getFolderWorkspaceRowGeometry({
      experimentalNewWorktreeCardStyle: false,
      isFolderBackedWorkspaceChild: true,
      isGrouped: true,
      groupDepth: 2,
      lineageDepth: 0
    })

    expect(geometry).toEqual({
      surfaceInset: 24,
      cardContentIndent: 6
    })
    expect(getFlushCardContentStart(geometry)).toBe(30)
  })

  it('preserves legacy manual grouped folder workspace row geometry', () => {
    const geometry = getFolderWorkspaceRowGeometry({
      experimentalNewWorktreeCardStyle: false,
      isFolderBackedWorkspaceChild: false,
      isGrouped: true,
      groupDepth: 1,
      lineageDepth: 0
    })

    expect(geometry).toEqual({
      surfaceInset: 14,
      cardContentIndent: 24
    })
    expect(getFlushCardContentStart(geometry)).toBe(38)
  })

  it('uses comparable repo worktree geometry for experimental folder-scanned folder workspaces', () => {
    const geometry = getFolderWorkspaceRowGeometry({
      experimentalNewWorktreeCardStyle: true,
      isFolderBackedWorkspaceChild: true,
      isGrouped: true,
      groupDepth: 1,
      lineageDepth: 0
    })

    expect(geometry).toEqual({
      surfaceInset: 42,
      cardContentIndent: 12
    })
    expect(getNewStyleCardLeadX(geometry)).toBe(getSidebarGlyphX(2))
  })

  it('uses comparable repo worktree geometry for experimental nested folder workspaces', () => {
    const geometry = getFolderWorkspaceRowGeometry({
      experimentalNewWorktreeCardStyle: true,
      isFolderBackedWorkspaceChild: true,
      isGrouped: true,
      groupDepth: 4,
      lineageDepth: 3
    })

    expect(geometry).toEqual({
      surfaceInset: 108,
      cardContentIndent: 12
    })
    expect(getNewStyleCardLeadX(geometry)).toBe(getSidebarGlyphX(5))
  })

  it('keeps experimental manual grouped folder workspaces on normal worktree geometry', () => {
    const geometry = getFolderWorkspaceRowGeometry({
      experimentalNewWorktreeCardStyle: true,
      isFolderBackedWorkspaceChild: false,
      isGrouped: true,
      groupDepth: 1,
      lineageDepth: 0
    })

    expect(geometry).toEqual(
      getNewStyleRowGeometry({ isGrouped: true, groupDepth: 1, lineageDepth: 0 })
    )
    expect(getNewStyleCardLeadX(geometry)).toBe(getSidebarGlyphX(2))
  })

  it('keeps experimental flat folder workspaces on normal worktree geometry', () => {
    const geometry = getFolderWorkspaceRowGeometry({
      experimentalNewWorktreeCardStyle: true,
      isFolderBackedWorkspaceChild: false,
      isGrouped: false,
      groupDepth: 3,
      lineageDepth: 0
    })

    expect(geometry).toEqual({
      surfaceInset: 0,
      cardContentIndent: 10
    })
    expect(getNewStyleCardLeadX(geometry)).toBe(getSidebarGlyphX(0))
  })

  it('caps header indentation separately from workspace content indentation', () => {
    expect(getProjectGroupHeaderPaddingLeft(100)).toBe(70)
  })

  it('aligns flat section headers with top-level project headers', () => {
    expect(WORKTREE_SECTION_HEADER_PADDING_LEFT).toBe(getProjectGroupHeaderPaddingLeft(0))
  })

  it('keeps root repo cards flush but insets cards inside project groups', () => {
    expect(getWorktreeCardSurfaceInset({ isGrouped: true, groupDepth: 0 })).toBe(0)
    expect(getWorktreeCardSurfaceInset({ isGrouped: true, groupDepth: 1 })).toBe(14)
  })

  it('does not inset card surfaces outside grouped views', () => {
    expect(getWorktreeCardSurfaceInset({ isGrouped: false, groupDepth: 4 })).toBe(0)
  })

  it('pulls flush card content back by the tuned inset gap', () => {
    expect(getFlushWorktreeCardPaddingLeft(20)).toBe('max(2px, calc(20px - 4px))')
  })

  it('subtracts only the surface margin and border for new-style status lanes', () => {
    expect(getFlushWorktreeCardPaddingLeft(32, true)).toBe('28px')
    expect(getFlushWorktreeCardPaddingLeft(32, true, true)).toBe('28px')
  })

  it('puts new-style titles on the text column when the status lane is hidden', () => {
    expect(getFlushWorktreeCardPaddingLeft(32, false, true)).toBe(`${28 + SIDEBAR_ROW_STEP}px`)
  })

  it('keeps flush card content off the sidebar edge without indentation', () => {
    expect(getFlushWorktreeCardPaddingLeft(0)).toBe('2px')
    expect(getFlushWorktreeCardPaddingLeft(0, true)).toBe('2px')
  })

  it('derives the lineage parent-child step from the pre-refactor grouped-card anchor', () => {
    expect(LINEAGE_IMMEDIATE_PARENT_STEP).toBe(20)
    expect(LINEAGE_CHILDREN_INLINE_OFFSET).toBe(
      LINEAGE_IMMEDIATE_PARENT_STEP - WORKTREE_CARD_SURFACE_MARGIN - FLUSH_CARD_MIN_CONTENT_INSET
    )
  })

  it('keeps experimental lineage nested rows from accumulating global depth', () => {
    const child = getLineageNestedRowGeometry({
      experimentalNewWorktreeCardStyle: true,
      inheritedCardContentIndent: 20,
      lineageDepth: 1
    })
    const grandchild = getLineageNestedRowGeometry({
      experimentalNewWorktreeCardStyle: true,
      inheritedCardContentIndent: 20,
      lineageDepth: 2
    })

    expect(child.surfaceInset).toBe(LINEAGE_NESTED_ROW_SURFACE_INSET)
    expect(grandchild.surfaceInset).toBe(LINEAGE_NESTED_ROW_SURFACE_INSET)
    expect(child.cardContentIndent).toBe(NEW_CARD_STYLE_LINEAGE_CHILD_CONTENT_INDENT)
    expect(grandchild.cardContentIndent).toBe(NEW_CARD_STYLE_LINEAGE_CHILD_CONTENT_INDENT)
  })

  it('preserves legacy nested row geometry for non-experimental cards', () => {
    expect(
      getLineageNestedRowGeometry({
        experimentalNewWorktreeCardStyle: false,
        inheritedCardContentIndent: 0,
        lineageDepth: 1
      }).surfaceInset
    ).toBe(14)
    expect(
      getLineageNestedRowGeometry({
        experimentalNewWorktreeCardStyle: false,
        inheritedCardContentIndent: 0,
        lineageDepth: 2
      }).surfaceInset
    ).toBe(28)
  })

  it('keeps each legacy lineage boundary at one immediate-parent step', () => {
    for (const parentContentStart of [FLUSH_CARD_MIN_CONTENT_INSET, 16, 34]) {
      const childStart = getLineageEffectiveChildStart({
        parentContentStart,
        lineageChildrenWrapperOffset: LINEAGE_CHILDREN_INLINE_OFFSET,
        nestedRowSurfaceInset: LINEAGE_NESTED_ROW_SURFACE_INSET,
        cardSurfaceMargin: WORKTREE_CARD_SURFACE_MARGIN,
        flushCardContentInset: FLUSH_CARD_MIN_CONTENT_INSET
      })

      expect(childStart - parentContentStart).toBe(LINEAGE_IMMEDIATE_PARENT_STEP)
    }
  })

  it('steps each new-style lineage child glyph by one row step', () => {
    const child = getLineageNestedRowGeometry({
      experimentalNewWorktreeCardStyle: true,
      inheritedCardContentIndent: 32,
      lineageDepth: 1
    })
    for (const parentGlyphX of [getSidebarGlyphX(1), getSidebarGlyphX(3)]) {
      const childStart = getLineageEffectiveChildStart({
        parentContentStart: parentGlyphX,
        lineageChildrenWrapperOffset: child.lineageChildrenInlineOffset,
        nestedRowSurfaceInset: child.surfaceInset,
        cardSurfaceMargin: WORKTREE_CARD_SURFACE_MARGIN + WORKTREE_CARD_SURFACE_BORDER,
        flushCardContentInset: Number.parseFloat(
          getFlushWorktreeCardPaddingLeft(child.cardContentIndent, true)
        )
      })

      expect(childStart - parentGlyphX).toBe(SIDEBAR_ROW_STEP)
    }
  })

  it('expresses lineage child wrapper width from the resolved inline offset', () => {
    expect(getLineageChildrenInlineStyle(LINEAGE_CHILDREN_INLINE_OFFSET)).toEqual({
      marginLeft: '14px',
      width: 'calc(100% - 14px)'
    })
  })
})

describe('new card style grid', () => {
  it('uses a 16px glyph column plus a 6px gap as the row step', () => {
    expect(SIDEBAR_ROW_STEP).toBe(22)
    expect([getSidebarGlyphX(0), getSidebarTextX(0)]).toEqual([14, 36])
    expect([getSidebarGlyphX(1), getSidebarTextX(1)]).toEqual([36, 58])
  })

  it('puts project header icons on the level glyph column', () => {
    for (const depth of [0, 1, 2]) {
      expect(SIDEBAR_LIST_INSET + getProjectGroupHeaderPaddingLeft(depth, true)).toBe(
        getSidebarGlyphX(depth)
      )
    }
    expect(getProjectGroupHeaderPaddingLeft(100, true)).toBe(getSidebarGlyphX(6) - 4)
  })

  it('puts grouped worktree glyphs one level under their header', () => {
    for (const groupDepth of [0, 1, 3]) {
      const geometry = getNewStyleRowGeometry({ isGrouped: true, groupDepth, lineageDepth: 0 })
      expect(geometry.cardContentIndent).toBe(12)
      expect(getNewStyleCardLeadX(geometry)).toBe(getSidebarGlyphX(groupDepth + 1))
    }
  })

  it('clears the header glyph column with the top-level surface', () => {
    const geometry = getNewStyleRowGeometry({ isGrouped: true, groupDepth: 0, lineageDepth: 0 })
    expect(SIDEBAR_LIST_INSET + geometry.surfaceInset + WORKTREE_CARD_SURFACE_MARGIN).toBe(28)
  })

  it('adds flat lineage depth by row step', () => {
    const geometry = getNewStyleRowGeometry({ isGrouped: true, groupDepth: 0, lineageDepth: 2 })
    expect(getNewStyleCardLeadX(geometry)).toBe(getSidebarGlyphX(3))
  })

  it('puts ungrouped rows on level 0', () => {
    const geometry = getNewStyleRowGeometry({ isGrouped: false, groupDepth: 4, lineageDepth: 0 })
    expect(getNewStyleCardLeadX(geometry)).toBe(getSidebarGlyphX(0))
  })

  it('aligns folder-scanned repo worktrees with manual-group worktrees', () => {
    for (const groupDepth of [0, 1, 2]) {
      const surfaceInset = getFolderBackedRepoWorktreeCardSurfaceInset({
        groupDepth,
        lineageDepth: 0,
        experimentalNewWorktreeCardStyle: true
      })
      const contentIndent = getFolderBackedRepoWorktreeCardContentIndent({
        groupDepth,
        lineageDepth: 0,
        experimentalNewWorktreeCardStyle: true
      })
      expect({ surfaceInset, cardContentIndent: contentIndent - surfaceInset }).toEqual(
        getNewStyleRowGeometry({ isGrouped: true, groupDepth, lineageDepth: 0 })
      )
    }
  })

  it('aligns folder workspace rows with worktree rows at the same depth', () => {
    for (const isFolderBackedWorkspaceChild of [true, false]) {
      const geometry = getFolderWorkspaceRowGeometry({
        experimentalNewWorktreeCardStyle: true,
        isFolderBackedWorkspaceChild,
        isGrouped: true,
        groupDepth: 2,
        lineageDepth: 0
      })
      expect(getNewStyleCardLeadX(geometry)).toBe(getSidebarGlyphX(3))
    }
  })

  it('places the title on the text column without a status lane', () => {
    const geometry = getNewStyleRowGeometry({ isGrouped: true, groupDepth: 0, lineageDepth: 0 })
    expect(getNewStyleCardLeadX(geometry, false)).toBe(getSidebarTextX(1))
  })
})

describe('legacy geometry is unchanged by the new-style flag defaults', () => {
  it('keeps legacy header padding', () => {
    expect([0, 1, 2, 6, 7].map((depth) => getProjectGroupHeaderPaddingLeft(depth))).toEqual([
      10, 20, 30, 70, 70
    ])
    expect(getProjectGroupHeaderPaddingLeft(2, false)).toBe(30)
  })

  it('keeps legacy content indents and insets when the flag is false', () => {
    const args = { isGrouped: true, groupDepth: 1, lineageDepth: 2 }
    expect(getWorktreeCardContentIndent({ ...args, experimentalNewWorktreeCardStyle: false })).toBe(
      74
    )
    expect(getWorktreeCardSurfaceInset({ ...args, experimentalNewWorktreeCardStyle: false })).toBe(
      14
    )
    expect(
      getFolderBackedRepoWorktreeCardContentIndent({
        groupDepth: 1,
        lineageDepth: 1,
        experimentalNewWorktreeCardStyle: false
      })
    ).toBe(48)
    expect(
      getFolderBackedRepoWorktreeCardSurfaceInset({
        groupDepth: 4,
        lineageDepth: 1,
        experimentalNewWorktreeCardStyle: false
      })
    ).toBe(56)
  })

  it('keeps legacy flush padding strings', () => {
    expect(getFlushWorktreeCardPaddingLeft(20, false, false)).toBe('max(2px, calc(20px - 4px))')
    expect(getFlushWorktreeCardPaddingLeft(0, false, false)).toBe('2px')
  })

  it('keeps legacy nested lineage geometry', () => {
    expect(
      getLineageNestedRowGeometry({
        experimentalNewWorktreeCardStyle: false,
        inheritedCardContentIndent: 38,
        lineageDepth: 2
      })
    ).toEqual({
      surfaceInset: 28,
      cardContentIndent: 10,
      lineageChildrenInlineOffset: LINEAGE_CHILDREN_INLINE_OFFSET
    })
  })
})
