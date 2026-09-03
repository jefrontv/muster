// The one row shape shared by Review, Running and Done (plan doc "Row anatomy"). Both Review's
// editable rows and Run/Done's status rows are icon + title + one-line summary + a right-aligned
// control, so this stays a pure layout component: it has no opinion on what state means, only how
// to draw it. 'unavailable' greys the whole row and swaps the summary for `reason` — a stage the
// user cannot act on this run; 'locked' greys only the control — a stage that already finished on
// a previous attempt and is shown for context, not editable.

import type React from 'react'
import { cn } from '@/lib/utils'

export type SiteSetupRowProps = {
  icon: React.ReactNode
  title: string
  /** One muted line under the title. */
  summary: React.ReactNode
  /** Right-aligned control: checkbox, pencil button, status text. */
  control?: React.ReactNode
  /** 'unavailable' greys the row (opacity-60) and shows `reason` as the summary; 'locked' greys only the control. */
  state?: 'available' | 'unavailable' | 'locked'
  reason?: string
  /** Below the summary: inline toggles, log disclosure, radio list. */
  children?: React.ReactNode
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
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-md border border-border px-3 py-2.5',
        unavailable && 'opacity-60'
      )}
    >
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start gap-2">
          <p className="text-sm font-medium">{title}</p>
          {control !== undefined ? (
            <div className={cn('ml-auto', state === 'locked' && 'opacity-60')}>{control}</div>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{unavailable ? reason : summary}</p>
        {!unavailable && children ? <div className="space-y-1 pt-1">{children}</div> : null}
      </div>
    </div>
  )
}

export default SiteSetupRow
