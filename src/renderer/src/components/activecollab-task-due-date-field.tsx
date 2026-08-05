import React, { useState } from 'react'
import { CalendarPlus, LoaderCircle, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DateRangeCalendar } from '@/components/ui/date-range-calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  activeCollabPickScheduleDay,
  activeCollabScheduleDraft,
  activeCollabScheduleFromDraft,
  formatActiveCollabScheduleLabel,
  type ActiveCollabSchedule,
  type ActiveCollabScheduleDraft
} from './activecollab-task-schedule'
import {
  activeCollabDueStatus,
  type ActiveCollabDueStatus
} from './task-page-activecollab-row-presentation'

type ActiveCollabTaskDueDateFieldProps = {
  /** Epoch ms already anchored to LOCAL calendar days; never re-project them. */
  startOn: number | null
  dueOn: number | null
  disabled: boolean
  busy: boolean
  /**
   * Save commits BOTH fields and Clear sends both as explicit nulls — an omitted key would leave
   * the server's value alone.
   */
  onChange: (schedule: ActiveCollabSchedule) => void
}

// Same urgency tones the assigned-task list uses, so a date reads the same on both surfaces.
const TONE: Record<ActiveCollabDueStatus, string> = {
  overdue: 'border-destructive/40 text-destructive',
  today: 'border-border text-foreground',
  upcoming: 'border-input text-foreground'
}

/**
 * Mount this KEYED BY TASK ID. The popover and its draft range are local state, and a newly
 * selected task must start from its own stored dates instead of inheriting the previous row's.
 */
export function ActiveCollabTaskDueDateField({
  startOn,
  dueOn,
  disabled,
  busy,
  onChange
}: ActiveCollabTaskDueDateFieldProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ActiveCollabScheduleDraft>(() =>
    activeCollabScheduleDraft(startOn, dueOn)
  )
  const label = formatActiveCollabScheduleLabel(startOn, dueOn)
  const status = dueOn !== null ? activeCollabDueStatus(dueOn, Date.now()) : null
  const committed = activeCollabScheduleFromDraft(draft)

  const setPickerOpen = (next: boolean): void => {
    if (next) {
      // Re-seed on every open so an abandoned draft never leaks into the next session.
      setDraft(activeCollabScheduleDraft(startOn, dueOn))
    }
    setOpen(next)
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Popover open={open} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            disabled={disabled}
            // Radix also toggles through onOpenChange; this direct call keeps the trigger honest
            // where the popover is replaced by a structural stand-in (tests) or asChild quirks.
            onClick={() => setPickerOpen(!open)}
            aria-label={translate(
              'auto.components.activecollab.task_workspace.due_date',
              'Due date'
            )}
            className={cn(
              label
                ? cn(
                    'rounded-md border px-2 py-0.5 font-normal text-[12px] tabular-nums',
                    TONE[status ?? 'upcoming']
                  )
                : '-ml-1.5 gap-1.5 text-muted-foreground'
            )}
          >
            {label ?? (
              <>
                <CalendarPlus className="size-3.5" />
                {translate('auto.components.activecollab.task_workspace.set_due_date', 'Set...')}
              </>
            )}
          </Button>
        </PopoverTrigger>
        {open ? (
          <PopoverContent align="start" className="w-auto p-2">
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setOpen(false)}
                aria-label={translate(
                  'auto.components.activecollab.task_workspace.close_date_picker',
                  'Close'
                )}
              >
                <X className="size-3" />
              </Button>
            </div>
            <DateRangeCalendar
              rangeStart={draft.start}
              rangeEnd={draft.end}
              onPickDay={(day) => setDraft((current) => activeCollabPickScheduleDay(current, day))}
            />
            <div className="flex items-center justify-between gap-1.5 pt-2">
              <Button
                variant="ghost"
                size="xs"
                disabled={startOn === null && dueOn === null}
                onClick={() => {
                  setOpen(false)
                  onChange({ startOn: null, dueOn: null })
                }}
              >
                {translate('auto.components.activecollab.task_workspace.clear_dates', 'Clear')}
              </Button>
              <Button
                size="xs"
                disabled={committed === null}
                onClick={() => {
                  if (committed === null) {
                    return
                  }
                  setOpen(false)
                  onChange(committed)
                }}
              >
                {translate('auto.components.activecollab.task_workspace.save_dates', 'Save')}
              </Button>
            </div>
          </PopoverContent>
        ) : null}
      </Popover>
      {status === 'overdue' ? (
        <span className="shrink-0 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
          {translate('auto.components.activecollab.task_workspace.overdue', 'Overdue')}
        </span>
      ) : null}
      {busy ? (
        <LoaderCircle className="size-3 shrink-0 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  )
}
