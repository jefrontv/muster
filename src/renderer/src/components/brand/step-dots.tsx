import type React from 'react'
import { cn } from '@/lib/utils'

type StepDotsProps = {
  total: number
  /** Zero-based index of the current step. */
  current: number
  className?: string
}

// Ink for done, coral for the current step, faded for steps to come. Measured progress stays a bar.
export function StepDots({ total, current, className }: StepDotsProps): React.JSX.Element {
  return (
    <span className={cn('inline-flex items-center gap-[3px]', className)} aria-hidden>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            'size-1.5 rounded-full',
            index < current ? 'bg-foreground' : index === current ? 'bg-brand' : 'bg-foreground/20'
          )}
        />
      ))}
    </span>
  )
}
