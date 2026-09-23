// New-style sidebar grid (docs/specs/projects-list-refresh.md, "Grid"). x values are
// measured from the sidebar edge; level 0 is headers, level 1 their child rows.
export const SIDEBAR_GLYPH_COLUMN = 16
export const SIDEBAR_GLYPH_GAP = 6
export const SIDEBAR_ROW_STEP = SIDEBAR_GLYPH_COLUMN + SIDEBAR_GLYPH_GAP
export const SIDEBAR_LEVEL0_GLYPH_X = 14
// Why: the list scroller's `pl-1`; row boxes start here, not at the sidebar edge.
export const SIDEBAR_LIST_INSET = 4
// Why: new-style card surfaces are borderless (states use fill and rings).
export const WORKTREE_CARD_SURFACE_BORDER = 0

function clampLevel(level: number): number {
  return Math.max(0, Math.floor(Number.isFinite(level) ? level : 0))
}

export function getSidebarGlyphX(level: number): number {
  return SIDEBAR_LEVEL0_GLYPH_X + clampLevel(level) * SIDEBAR_ROW_STEP
}

export function getSidebarTextX(level: number): number {
  return getSidebarGlyphX(level) + SIDEBAR_ROW_STEP
}

/** Glyph x relative to the list content box, i.e. what row padding must add up to. */
export function getSidebarGlyphIndent(level: number): number {
  return getSidebarGlyphX(level) - SIDEBAR_LIST_INSET
}
