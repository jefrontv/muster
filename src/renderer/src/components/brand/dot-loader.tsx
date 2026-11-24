import type React from 'react'
import { cn } from '@/lib/utils'

// Outer ring of the 3x3 block, clockwise from the top-left; the coral dot steps through it.
const RING = [0, 1, 2, 5, 8, 7, 6, 3]

type DotLoaderProps = {
  /** Visible caption under the dots; also the accessible status text. */
  label?: string
  className?: string
}

// Full-surface loading only (app start, first thread load, site import). Inline spinners stay Loader2.
export function DotLoader({ label, className }: DotLoaderProps): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn('flex flex-col items-center gap-3', className)}
    >
      <svg viewBox="0 0 8 8" width={24} height={24} className="dot-loader" aria-hidden>
        {Array.from({ length: 9 }, (_, cell) => {
          const step = RING.indexOf(cell)
          return (
            <circle
              key={cell}
              cx={1 + (cell % 3) * 3}
              cy={1 + Math.floor(cell / 3) * 3}
              r={1}
              className={
                step === -1
                  ? 'fill-foreground/20'
                  : cn('dot-loader-step', step === 0 && 'dot-loader-first')
              }
              style={step === -1 ? undefined : { ['--dot-step' as string]: step }}
            />
          )
        })}
      </svg>
      {label ? <span className="text-xs text-muted-foreground">{label}</span> : null}
    </div>
  )
}
