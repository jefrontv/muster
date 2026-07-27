import React, { useState } from 'react'
import { CalendarPlus, LoaderCircle, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  activeCollabDueDateFromInput,
  formatActiveCollabDueDate
} from './activecollab-task-due-date'
import {
  activeCollabDueStatus,
  type ActiveCollabDueStatus
} from './task-page-activecollab-row-presentation'

type ActiveCollabTaskDueDateFieldProps = {
  /** Epoch ms already anchored to a LOCAL calendar day; never re-project it. */
  dueOn: number | null
  disabled: boolean
  busy: boolean
  /** An explicit null CLEARS the date; omitting the key would leave the server's value alone. */
  onChange: (dueOn: number | null) => void
}

// Same urgency tones the assigned-task list uses, so a date reads the same on both surfaces.
const TONE: Record<ActiveCollabDueStatus, string> = {
  overdue: 'border-destructive/40 text-destructive',
  today: 'border-border text-foreground',
  upcoming: 'border-input text-foreground'
}

/**
 * Mount this KEYED BY TASK ID. Whether the picker is revealed is local state, and a newly selected
 * task must start from the calm `Set...` affordance instead of inheriting the previous row's box.
 */
export function ActiveCollabTaskDueDateField({
  dueOn,
  disabled,
  busy,
  onChange
}: ActiveCollabTaskDueDateFieldProps): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const due = formatActiveCollabDueDate(dueOn)
  const status = dueOn !== null && due ? activeCollabDueStatus(dueOn, Date.now()) : null
  const spinner = busy ? (
    <LoaderCircle className="size-3 shrink-0 animate-spin text-muted-foreground" />
  ) : null

  // No date and no intent to set one: an empty `dd/mm/yyyy` box is noise, so offer the action.
  if (!due && !picking) {
    return (
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="xs"
          disabled={disabled}
          onClick={() => setPicking(true)}
          className="-ml-1.5 gap-1.5 text-muted-foreground"
        >
          <CalendarPlus className="size-3.5" />
          {translate('auto.components.activecollab.task_workspace.set_due_date', 'Set...')}
        </Button>
        {spinner}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <input
        type="date"
        // Only ever true on the render that first mounts the input, so it cannot steal focus later.
        autoFocus={picking}
        value={due?.iso ?? ''}
        disabled={disabled}
        aria-label={translate('auto.components.activecollab.task_workspace.due_date', 'Due date')}
        onChange={(event) => {
          const value = event.target.value
          if (value === '') {
            setPicking(false)
            onChange(null)
            return
          }
          const picked = activeCollabDueDateFromInput(value)
          if (picked !== null) {
            onChange(picked)
          }
        }}
        className={cn(
          'rounded-md border bg-transparent px-2 py-0.5 text-[12px] tabular-nums outline-none focus-visible:border-ring disabled:opacity-50',
          TONE[status ?? 'upcoming']
        )}
      />
      {status === 'overdue' ? (
        <span className="shrink-0 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
          {translate('auto.components.activecollab.task_workspace.overdue', 'Overdue')}
        </span>
      ) : null}
      {due ? (
        <Button
          size="icon-xs"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            setPicking(false)
            onChange(null)
          }}
          aria-label={translate(
            'auto.components.activecollab.task_workspace.clear_due_date',
            'Clear due date'
          )}
        >
          <X className="size-3" />
        </Button>
      ) : null}
      {spinner}
    </div>
  )
}
