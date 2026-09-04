// The one row shape shared by Review, Running and Done: icon | title + one-line summary | control,
// on a single baseline. Rows live inside SiteSetupRowList, which draws one border around the set
// and a divider between rows - one boxed card per row read as a pile of unrelated panels.
//
// A pure layout component: it has no opinion on what state means, only how to draw it.
// 'unavailable' greys the row and swaps the summary for `reason`; 'locked' greys only the control.

import type React from 'react'
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
  children
}: SiteSetupRowProps): React.JSX.Element {
  const unavailable = state === 'unavailable'
  const body = unavailable ? reason : summary
  return (
    <div
      className={cn(
        'grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5',
        unavailable && 'opacity-60'
      )}
    >
      <span className="flex size-4 items-center justify-center text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-5">{title}</p>
        {body ? <p className="truncate text-xs leading-4 text-muted-foreground">{body}</p> : null}
      </div>
      {/* Reserve the column even when empty so summaries line up across rows. */}
      <div
        className={cn(
          'flex min-h-7 items-center justify-end gap-1',
          state === 'locked' && 'opacity-60'
        )}
      >
        {control}
      </div>
      {!unavailable && children ? (
        <div className="col-start-2 col-span-2 pt-2">{children}</div>
      ) : null}
    </div>
  )
}

export default SiteSetupRow
