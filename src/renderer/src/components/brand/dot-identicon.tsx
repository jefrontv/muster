import type React from 'react'
import { cn } from '@/lib/utils'
import { dotCentre, SMALL_GRID } from './formation-grid'
import { identiconCells } from './formation-hash'

type DotIdenticonProps = {
  id: string
  size: number
  /** Only the viewer's own profile gets the coral centre. */
  isSelf?: boolean
  className?: string
}

// Ink on Paper; the 16u small-mark grid keeps dots at 2px or more from 16px up.
export function DotIdenticon({
  id,
  size,
  isSelf,
  className
}: DotIdenticonProps): React.JSX.Element {
  const cells = identiconCells(id)
  return (
    <svg
      viewBox={`0 0 ${SMALL_GRID.tile} ${SMALL_GRID.tile}`}
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <rect
        width={SMALL_GRID.tile}
        height={SMALL_GRID.tile}
        rx={SMALL_GRID.radius}
        fill="var(--brand-paper)"
      />
      {cells.map((on, index) => {
        const row = Math.floor(index / 5)
        const col = index % 5
        const centre = index === 12 && isSelf
        if (!on && !centre) {
          return null
        }
        return (
          <circle
            key={index}
            cx={dotCentre(col, SMALL_GRID.margin)}
            cy={dotCentre(row, SMALL_GRID.margin)}
            r={1}
            fill={centre ? 'var(--brand)' : 'var(--brand-mark-ink)'}
          />
        )
      })}
    </svg>
  )
}
