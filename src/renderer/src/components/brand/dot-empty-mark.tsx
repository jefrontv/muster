import type React from 'react'
import { cn } from '@/lib/utils'

// Faded 5x5 grid with one coral centre dot, placed above an empty state's heading. Static by design.
export function DotEmptyMark({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 14 14"
      width={64}
      height={64}
      className={cn('shrink-0', className)}
      aria-hidden
    >
      {Array.from({ length: 25 }, (_, index) => (
        <circle
          key={index}
          cx={1 + (index % 5) * 3}
          cy={1 + Math.floor(index / 5) * 3}
          r={1}
          className={index === 12 ? 'fill-brand' : 'fill-foreground/10'}
        />
      ))}
    </svg>
  )
}
