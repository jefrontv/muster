import {
  SIDEBAR_ROW_STEP,
  WORKTREE_CARD_SURFACE_BORDER,
  getSidebarGlyphIndent
} from './sidebar-row-grid'

export { SIDEBAR_ROW_STEP } from './sidebar-row-grid'

export const SIDEBAR_TREE_INDENT = 18
// Why: project-grouped cards need to read as children even after the card
// surface inset is subtracted, while lineage rows keep the base tree step.
const PROJECT_WORKTREE_CARD_EXTRA_INDENT = 2
// Why: flush cards span the full row, so their content is pulled back from the
// raw tree indent to sit under the group header. A smaller pullback nudges
// content rightward for clearer nesting; this is the knob to tune that gap.
export const FLUSH_CARD_CONTENT_PULLBACK = 4
// Why: even at zero indent a flush card keeps this minimal left inset so its
// surface never sits hard against the sidebar edge.
export const FLUSH_CARD_MIN_CONTENT_INSET = 2
export const WORKTREE_CARD_SURFACE_MARGIN = 4
// Why: pre-refactor level-1 lineage used the grouped card content step; keep
// that anchor while nested levels advance evenly instead of accumulating depth.
export const LINEAGE_IMMEDIATE_PARENT_STEP =
  SIDEBAR_TREE_INDENT + PROJECT_WORKTREE_CARD_EXTRA_INDENT
export const LINEAGE_NESTED_ROW_SURFACE_INSET = 0
export const LINEAGE_CHILDREN_INLINE_OFFSET =
  LINEAGE_IMMEDIATE_PARENT_STEP - WORKTREE_CARD_SURFACE_MARGIN - FLUSH_CARD_MIN_CONTENT_INSET
// Why: new-style children sit inside the parent's content box, so wrapper offset + this
// indent is the whole parent-glyph -> child-glyph step.
export const NEW_CARD_STYLE_LINEAGE_CHILD_CONTENT_INDENT =
  SIDEBAR_ROW_STEP - LINEAGE_CHILDREN_INLINE_OFFSET
// Why: grouped workspace cards should move their surface inward without using
// the full tree step, preserving the existing compact child-card rhythm.
const GROUPED_WORKTREE_CARD_SURFACE_INDENT = 14
export const PROJECT_GROUP_HEADER_BASE_PADDING = 10
// Why: workspace/status headers and project headers occupy the same sidebar
// row role, so their titles should not shift when switching grouping modes.
export const WORKTREE_SECTION_HEADER_PADDING_LEFT = PROJECT_GROUP_HEADER_BASE_PADDING
export const PROJECT_GROUP_HEADER_INDENT = 10
export const MAX_PROJECT_GROUP_HEADER_DEPTH = 6

type NewCardStyleFlag = { experimentalNewWorktreeCardStyle?: boolean }

function clampDepth(depth: number): number {
  return Math.max(0, Math.floor(Number.isFinite(depth) ? depth : 0))
}

// Why: new-style surfaces step with their header so every card keeps the same inner padding.
function getNewCardStyleSurfaceInset(groupDepth: number): number {
  return clampDepth(groupDepth) * SIDEBAR_ROW_STEP
}

export function getProjectGroupHeaderPaddingLeft(
  depth: number,
  experimentalNewWorktreeCardStyle = false
): number {
  const clampedDepth = Math.min(clampDepth(depth), MAX_PROJECT_GROUP_HEADER_DEPTH)
  if (experimentalNewWorktreeCardStyle) {
    return getSidebarGlyphIndent(clampedDepth)
  }
  return PROJECT_GROUP_HEADER_BASE_PADDING + clampedDepth * PROJECT_GROUP_HEADER_INDENT
}

export function getWorktreeCardContentIndent(
  args: {
    isGrouped: boolean
    groupDepth: number
    lineageDepth: number
  } & NewCardStyleFlag
): number {
  const groupSteps = args.isGrouped ? clampDepth(args.groupDepth) + 1 : 0
  if (args.experimentalNewWorktreeCardStyle) {
    // Why: a card's status glyph shares its header's glyph column; only lineage steps in.
    return getSidebarGlyphIndent(Math.max(0, groupSteps - 1) + clampDepth(args.lineageDepth))
  }
  const projectCardIndent = args.isGrouped ? PROJECT_WORKTREE_CARD_EXTRA_INDENT : 0
  return (groupSteps + clampDepth(args.lineageDepth)) * SIDEBAR_TREE_INDENT + projectCardIndent
}

export function getFolderBackedRepoWorktreeCardContentIndent(
  args: {
    groupDepth: number
    lineageDepth: number
  } & NewCardStyleFlag
): number {
  if (args.experimentalNewWorktreeCardStyle) {
    return getSidebarGlyphIndent(clampDepth(args.groupDepth) + clampDepth(args.lineageDepth))
  }
  // Why: folder-scanned groups indent repo headers by the compact header step;
  // worktree rows should follow that rhythm instead of adding a full tree step.
  return (
    getProjectGroupHeaderPaddingLeft(args.groupDepth) +
    PROJECT_GROUP_HEADER_BASE_PADDING +
    clampDepth(args.lineageDepth) * SIDEBAR_TREE_INDENT
  )
}

export function getFolderBackedRepoWorktreeCardSurfaceInset(
  args: {
    groupDepth: number
    lineageDepth: number
  } & NewCardStyleFlag
): number {
  if (args.experimentalNewWorktreeCardStyle) {
    return getNewCardStyleSurfaceInset(args.groupDepth)
  }
  const contentAnchor = getFolderBackedRepoWorktreeCardContentIndent(args)
  const genericSurfaceInset = getWorktreeCardSurfaceInset({
    isGrouped: true,
    groupDepth: args.groupDepth
  })
  const maxSurfaceInset =
    contentAnchor - WORKTREE_CARD_SURFACE_MARGIN - FLUSH_CARD_MIN_CONTENT_INSET

  // Why: compact folder-backed repo rows still use flush-card margin/padding;
  // cap the surface before those fixed insets overshoot the target anchor.
  return Math.min(genericSurfaceInset, Math.max(0, maxSurfaceInset))
}

export function getFolderWorkspaceCardContentIndent(args: { groupDepth: number }): number {
  const parentGroupDepth = Math.max(0, clampDepth(args.groupDepth) - 1)
  // Why: folder workspaces are direct children of their owning folder group,
  // so they advance by the same compact header step as group -> repo.
  return getProjectGroupHeaderPaddingLeft(parentGroupDepth) + PROJECT_GROUP_HEADER_INDENT
}

export function getFolderWorkspaceCardSurfaceInset(args: {
  isGrouped: boolean
  groupDepth: number
}): number {
  const contentAnchor = getFolderWorkspaceCardContentIndent({ groupDepth: args.groupDepth })
  const genericSurfaceInset = getWorktreeCardSurfaceInset(args)
  const maxSurfaceInset =
    contentAnchor - WORKTREE_CARD_SURFACE_MARGIN - FLUSH_CARD_MIN_CONTENT_INSET

  // Why: flush cards add their own margin and minimum padding, so deep folder
  // workspace surfaces must be capped to keep the final content anchor compact.
  return Math.min(genericSurfaceInset, Math.max(0, maxSurfaceInset))
}

export function getFolderWorkspaceRowGeometry(args: {
  experimentalNewWorktreeCardStyle: boolean
  isFolderBackedWorkspaceChild: boolean
  isGrouped: boolean
  groupDepth: number
  lineageDepth: number
}): {
  surfaceInset: number
  cardContentIndent: number
} {
  if (args.experimentalNewWorktreeCardStyle && args.isFolderBackedWorkspaceChild) {
    // Why: standalone folder workspace rows do not get a lineage wrapper
    // offset, so align them to the comparable folder-backed repo row anchor.
    const contentAnchor = getFolderBackedRepoWorktreeCardContentIndent({
      groupDepth: args.groupDepth,
      lineageDepth: 0,
      experimentalNewWorktreeCardStyle: true
    })
    const surfaceInset = getFolderBackedRepoWorktreeCardSurfaceInset({
      groupDepth: args.groupDepth,
      lineageDepth: 0,
      experimentalNewWorktreeCardStyle: true
    })

    return {
      surfaceInset,
      cardContentIndent: Math.max(0, contentAnchor - surfaceInset)
    }
  }

  const contentIndent = args.isFolderBackedWorkspaceChild
    ? getFolderWorkspaceCardContentIndent({
        groupDepth: args.groupDepth
      })
    : getWorktreeCardContentIndent({
        isGrouped: args.isGrouped,
        groupDepth: args.groupDepth,
        lineageDepth: args.lineageDepth,
        experimentalNewWorktreeCardStyle: args.experimentalNewWorktreeCardStyle
      })
  // Why: legacy folder-scanned folder workspaces keep their compact anchor,
  // while all other folder rows share the normal worktree row surface path.
  const surfaceInset = args.isFolderBackedWorkspaceChild
    ? getFolderWorkspaceCardSurfaceInset({
        isGrouped: true,
        groupDepth: args.groupDepth
      })
    : getWorktreeCardSurfaceInset({
        isGrouped: args.isGrouped,
        groupDepth: args.groupDepth,
        experimentalNewWorktreeCardStyle: args.experimentalNewWorktreeCardStyle
      })

  return {
    surfaceInset,
    cardContentIndent: Math.max(0, contentIndent - surfaceInset)
  }
}

export function getWorktreeCardSurfaceInset(
  args: {
    isGrouped: boolean
    groupDepth: number
  } & NewCardStyleFlag
): number {
  if (!args.isGrouped) {
    return 0
  }
  return args.experimentalNewWorktreeCardStyle
    ? getNewCardStyleSurfaceInset(args.groupDepth)
    : clampDepth(args.groupDepth) * GROUPED_WORKTREE_CARD_SURFACE_INDENT
}

/**
 * New style: `contentIndent` is the status glyph's x inside the card's row box, so the
 * padding is that minus the surface margin and border. Without a status lane the title
 * takes the text column instead.
 */
export function getFlushWorktreeCardPaddingLeft(
  contentIndent: number,
  applyNewCardStyleStatusLaneOffset = false,
  experimentalNewWorktreeCardStyle = applyNewCardStyleStatusLaneOffset
): string {
  if (experimentalNewWorktreeCardStyle) {
    const glyphPadding = Math.max(
      FLUSH_CARD_MIN_CONTENT_INSET,
      contentIndent - WORKTREE_CARD_SURFACE_MARGIN - WORKTREE_CARD_SURFACE_BORDER
    )
    return `${applyNewCardStyleStatusLaneOffset ? glyphPadding : glyphPadding + SIDEBAR_ROW_STEP}px`
  }
  return contentIndent > 0
    ? `max(${FLUSH_CARD_MIN_CONTENT_INSET}px, calc(${contentIndent}px - ${FLUSH_CARD_CONTENT_PULLBACK}px))`
    : `${FLUSH_CARD_MIN_CONTENT_INSET}px`
}

/** @deprecated New-style padding is exact now; kept until WorktreeCard stops calling it. */
export function getNewCardStyleParentContentMarginLeft(_contentIndent: number): number {
  return 0
}

export function getLineageNestedRowGeometry(args: {
  experimentalNewWorktreeCardStyle: boolean
  inheritedCardContentIndent: number
  lineageDepth: number
}): {
  surfaceInset: number
  cardContentIndent: number
  lineageChildrenInlineOffset: number
} {
  if (args.experimentalNewWorktreeCardStyle) {
    // Why: the parent card already contributes the inherited/group baseline;
    // adding global lineage depth here would double-count nested descendants.
    return {
      surfaceInset: LINEAGE_NESTED_ROW_SURFACE_INSET,
      cardContentIndent: NEW_CARD_STYLE_LINEAGE_CHILD_CONTENT_INDENT,
      lineageChildrenInlineOffset: LINEAGE_CHILDREN_INLINE_OFFSET
    }
  }

  const surfaceInset = getWorktreeCardSurfaceInset({
    isGrouped: true,
    groupDepth: args.lineageDepth
  })
  return {
    surfaceInset,
    cardContentIndent: Math.max(0, args.inheritedCardContentIndent - surfaceInset),
    lineageChildrenInlineOffset: LINEAGE_CHILDREN_INLINE_OFFSET
  }
}

export function getLineageChildrenInlineStyle(offset: number | string): {
  marginLeft: string
  width: string
} {
  const inlineOffset = typeof offset === 'number' ? `${offset}px` : offset
  return {
    marginLeft: inlineOffset,
    width: `calc(100% - ${inlineOffset})`
  }
}

export function getLineageEffectiveChildStart(args: {
  parentContentStart?: number
  lineageChildrenWrapperOffset: number
  nestedRowSurfaceInset: number
  cardSurfaceMargin: number
  flushCardContentInset: number
}): number {
  return (
    (args.parentContentStart ?? 0) +
    args.lineageChildrenWrapperOffset +
    args.nestedRowSurfaceInset +
    args.cardSurfaceMargin +
    args.flushCardContentInset
  )
}
