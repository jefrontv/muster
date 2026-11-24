import type React from 'react'
import { cn } from '@/lib/utils'
import {
  dotCentre,
  FORMATION_DOTS,
  FULL_GRID,
  SMALL_GRID,
  SMALL_MARK_MAX_PX
} from './formation-grid'

type MusterMarkProps = {
  size: number
  /** tile: the app-icon tile. glyph: no tile, M dots in currentColor, centre in --brand. */
  variant?: 'tile' | 'glyph'
  /** Dark tile is the Ink variant for surfaces where Paper would vanish. */
  tone?: 'paper' | 'dark'
  className?: string
  /** Omit for decorative use next to the wordmark or app name. */
  title?: string
  /** Glyph only: a literal centre colour for surfaces captured outside the theme (share images). */
  centreColor?: string
}

// The mark always uses Coral; the small Paper tile takes Coral deep so the M's vertex holds in greyscale.
const CORAL = '#EF7A5A'
const CORAL_DEEP = '#E25630'
const DARK_TILE_STONE = '#3A3B40'
// Why: Paper on white is 1.21:1, so the Paper tile edge carries a 1px Ink hairline at 10%.
const PAPER_HAIRLINE = 'rgb(23 24 28 / 0.1)'

export function MusterMark({
  size,
  variant = 'tile',
  tone = 'paper',
  className,
  title,
  centreColor
}: MusterMarkProps): React.JSX.Element {
  const small = variant === 'glyph' || size <= SMALL_MARK_MAX_PX
  const grid = small ? SMALL_GRID : FULL_GRID
  const dark = tone === 'dark'
  const mColor =
    variant === 'glyph' ? 'currentColor' : dark ? 'var(--brand-paper)' : 'var(--brand-mark-ink)'
  const stoneColor = dark ? DARK_TILE_STONE : 'var(--brand-stone)'
  const px = grid.tile / size
  const centreFill =
    variant === 'glyph' ? (centreColor ?? 'var(--brand)') : small && !dark ? CORAL_DEEP : CORAL
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true }

  return (
    <svg
      viewBox={`0 0 ${grid.tile} ${grid.tile}`}
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      {...a11y}
    >
      {variant === 'tile' && dark ? (
        <rect width={grid.tile} height={grid.tile} rx={grid.radius} fill="var(--brand-mark-ink)" />
      ) : null}
      {variant === 'tile' && !dark ? (
        <>
          <rect width={grid.tile} height={grid.tile} rx={grid.radius} fill={PAPER_HAIRLINE} />
          <rect
            x={px}
            y={px}
            width={grid.tile - 2 * px}
            height={grid.tile - 2 * px}
            rx={grid.radius - px}
            fill="var(--brand-paper)"
          />
        </>
      ) : null}
      {FORMATION_DOTS.map(({ row, col, cell }) =>
        small && cell === 's' ? null : (
          <circle
            key={`${row}-${col}`}
            cx={dotCentre(col, grid.margin)}
            cy={dotCentre(row, grid.margin)}
            r={1}
            fill={cell === 'D' ? mColor : cell === 'C' ? centreFill : stoneColor}
          />
        )
      )}
    </svg>
  )
}
