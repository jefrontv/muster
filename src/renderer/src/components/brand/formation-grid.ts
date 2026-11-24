// The Formation 5x5 grid: D is an M dot, s a stone dot, C the coral centre.
export const FORMATION_DOT_MAP = ['DsssD', 'DDsDD', 'DsCsD', 'DsssD', 'DsssD'] as const

export type FormationCell = 'D' | 's' | 'C'

export type FormationDot = { row: number; col: number; cell: FormationCell }

export const FORMATION_DOTS: readonly FormationDot[] = FORMATION_DOT_MAP.flatMap((line, row) =>
  [...line].map((cell, col) => ({ row, col, cell: cell as FormationCell }))
)

// Below 48px the stone dots smear into the tile, so the small mark keeps only the M and centre.
export const SMALL_MARK_MAX_PX = 47

// Grid in tile units: full mark is a 20u tile (dot 2, gap 1, margin 3); small mark a 16u tile (margin 1).
export const FULL_GRID = { tile: 20, margin: 3, radius: 4.5 } as const
export const SMALL_GRID = { tile: 16, margin: 1, radius: 4 } as const

export function dotCentre(index: number, margin: number): number {
  return margin + 1 + index * 3
}
