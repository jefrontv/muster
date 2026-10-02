// The one row shape shared by Review, Running and Done: icon | title + one-line summary | control,
// on a single baseline. Rows live inside SiteSetupRowList, which draws one border around the set
// and a divider between rows - one boxed card per row read as a pile of unrelated panels.
//
// A pure layout component: it has no opinion on what state means, only how to draw it.
// 'unavailable' greys the row and swaps the summary for `reason`; 'locked' greys only the control.
// An unavailable row may still carry `fixes`: the actions that make it available, never greyed.

import type React from 'react'
import { Children } from 'react'
import { cn } from '@/lib/utils'

export type SiteSetupRowProps = {
  icon: React.ReactNode
  title: string
  /** One muted line under the title. */
  summary: React.ReactNode
  /** Right-aligned control, vertically centred on the title: checkbox, pencil button, status text. */
  control?: React.ReactNode
  state?: 'available' | 'unavailable' | 'locked'
  reason?: string
  /** Below the summary, aligned to the text column: inline toggles, log disclosure, radio list. */
  children?: React.ReactNode
  /** Shown under an unavailable row's reason, at full opacity: what makes the row available. */
  fixes?: React.ReactNode
}

export function SiteSetupRowList({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('divide-y divide-border rounded-md border border-border', className)}>
      {children}
    </div>
  )
}

export function SiteSetupRow({
  icon,
  title,
  summary,
  control,
  state = 'available',
  reason,
  children,
  fixes
}: SiteSetupRowProps): React.JSX.Element {
  const unavailable = state === 'unavailable'
  const body = unavailable ? reason : summary
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5">
      <span
        className={cn(
          'flex size-4 items-center justify-center text-muted-foreground',
          unavailable && 'opacity-60'
        )}
      >
        {icon}
      </span>
      <div className={cn('min-w-0', unavailable && 'opacity-60')}>
        <p className="text-sm font-medium leading-5">{title}</p>
        {/* A reason is why the row is off; cut short it explains nothing, so it wraps. */}
        {body ? (
          <p
            className={cn(
              'text-xs leading-4 text-muted-foreground',
              unavailable ? 'break-words' : 'truncate'
            )}
          >
            {body}
          </p>
        ) : null}
      </div>
      {/* Reserve the column even when empty so summaries line up across rows. */}
      <div
        className={cn(
          'flex min-h-7 items-center justify-end gap-1',
          (state === 'locked' || unavailable) && 'opacity-60'
        )}
      >
        {control}
      </div>
      {/* Callers pass conditional children; an all-null slot must not leave its padding behind. */}
      {!unavailable && Children.toArray(children).length > 0 ? (
        <div className="col-start-2 col-span-2 space-y-2 pt-2">{children}</div>
      ) : null}
      {unavailable && fixes ? (
        <div className="col-start-2 col-span-2 flex flex-wrap gap-2 pt-2">{fixes}</div>
      ) : null}
    </div>
  )
}

export default SiteSetupRow
