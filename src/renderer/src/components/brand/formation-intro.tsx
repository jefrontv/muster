import type React from 'react'
import { cn } from '@/lib/utils'
import { dotCentre, FORMATION_DOTS, FULL_GRID } from './formation-grid'
import { fnv1a32 } from './formation-hash'

// Scatter in tile units; seeded so every launch shows the same settle.
function scatter(index: number): { dx: number; dy: number } {
  const hash = fnv1a32(`formation-${index}`)
  return { dx: ((hash & 0xff) / 255 - 0.5) * 8, dy: (((hash >> 8) & 0xff) / 255 - 0.5) * 8 }
}

/**
 * First-launch Formation: 25 dots settle into the grid, the M inks in, then the coral dot lights.
 * Runs once in 600ms; a still frame under prefers-reduced-motion (see formation-motif.css).
 */
export function FormationIntro({
  size,
  className
}: {
  size: number
  className?: string
}): React.JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${FULL_GRID.tile} ${FULL_GRID.tile}`}
      width={size}
      height={size}
      className={cn('formation-intro shrink-0', className)}
      aria-hidden
    >
      <rect
        width={FULL_GRID.tile}
        height={FULL_GRID.tile}
        rx={FULL_GRID.radius}
        fill="var(--brand-paper)"
      />
      {FORMATION_DOTS.map(({ row, col, cell }, index) => {
        const { dx, dy } = scatter(index)
        const fill =
          cell === 'D' ? 'var(--brand-mark-ink)' : cell === 'C' ? '#EF7A5A' : 'var(--brand-stone)'
        return (
          <circle
            key={index}
            cx={dotCentre(col, FULL_GRID.margin)}
            cy={dotCentre(row, FULL_GRID.margin)}
            r={1}
            fill={fill}
            data-cell={cell}
            style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px` }}
          />
        )
      })}
    </svg>
  )
}
