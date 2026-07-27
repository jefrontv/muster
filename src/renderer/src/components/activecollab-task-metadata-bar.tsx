import React from 'react'
import { CalendarDays, CircleCheck, LoaderCircle, RotateCcw, UserRound, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'
import {
  activeCollabDueDateFromInput,
  formatActiveCollabDueDate
} from './activecollab-task-due-date'
import { ActiveCollabLabelChip, ActiveCollabLabelEditor } from './activecollab-task-label-editor'
import type { ActiveCollabTaskWriteField } from './activecollab-task-writes'

type ActiveCollabTaskMetadataBarProps = {
  task: ActiveCollabTask
  pending: ActiveCollabTaskWriteField | null
  onCompletedChange: (completed: boolean) => void
  onDueOnChange: (dueOn: number | null) => void
  onLabelNamesChange: (labelNames: string[]) => void
}

export function ActiveCollabTaskMetadataBar({
  task,
  pending,
  onCompletedChange,
  onDueOnChange,
  onLabelNamesChange
}: ActiveCollabTaskMetadataBarProps): React.JSX.Element {
  const busy = pending !== null
  const due = formatActiveCollabDueDate(task.dueOn)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-4 py-2.5">
      <Button
        size="xs"
        variant="outline"
        disabled={busy}
        onClick={() => onCompletedChange(!task.isCompleted)}
        className="gap-1.5"
      >
        {pending === 'completion' ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : task.isCompleted ? (
          <RotateCcw className="size-3.5" />
        ) : (
          <CircleCheck className="size-3.5" />
        )}
        {task.isCompleted
          ? translate('auto.components.activecollab.task_workspace.reopen', 'Reopen task')
          : translate('auto.components.activecollab.task_workspace.complete', 'Complete task')}
      </Button>

      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <UserRound className="size-3.5" />
        {task.assigneeName ??
          translate('auto.components.activecollab.task_workspace.unassigned', 'Unassigned')}
      </span>

      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <CalendarDays className="size-3.5" />
        <input
          type="date"
          // `task.dueOn` is already anchored to the local calendar day; reading it with local
          // getters keeps the day the instance stored.
          value={due?.iso ?? ''}
          disabled={busy}
          aria-label={translate('auto.components.activecollab.task_workspace.due_date', 'Due date')}
          onChange={(event) => {
            const value = event.target.value
            if (value === '') {
              // An explicit null CLEARS the date; omitting the key would leave it alone.
              onDueOnChange(null)
              return
            }
            const picked = activeCollabDueDateFromInput(value)
            if (picked !== null) {
              onDueOnChange(picked)
            }
          }}
          className="rounded-md border border-input bg-transparent px-1.5 py-0.5 text-[11px] outline-none focus-visible:border-ring disabled:opacity-50"
        />
        {due ? (
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onDueOnChange(null)}
            aria-label={translate(
              'auto.components.activecollab.task_workspace.clear_due_date',
              'Clear due date'
            )}
          >
            <X className="size-3" />
          </Button>
        ) : null}
        {pending === 'dueDate' ? <LoaderCircle className="size-3 animate-spin" /> : null}
      </span>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {task.labels.map((label) => (
          <ActiveCollabLabelChip key={label.id} label={label} />
        ))}
        <ActiveCollabLabelEditor
          labels={task.labels}
          disabled={busy}
          busy={pending === 'labels'}
          onChange={onLabelNamesChange}
        />
      </div>
    </div>
  )
}
