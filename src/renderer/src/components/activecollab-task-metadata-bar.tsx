import React from 'react'
import { Flag, LoaderCircle } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'
import { ActiveCollabTaskAssigneeField } from './activecollab-task-assignee-field'
import { ActiveCollabTaskDueDateField } from './activecollab-task-due-date-field'
import { ActiveCollabLabelChip, ActiveCollabLabelEditor } from './activecollab-task-label-editor'
import { ActiveCollabTaskWatchers } from './activecollab-task-watchers'
import type { ActiveCollabTaskWriteField } from './activecollab-task-writes'
import type { ActiveCollabSchedule } from './activecollab-task-schedule'

type ActiveCollabTaskMetadataBarProps = {
  task: ActiveCollabTask
  /** Watchers, by user id. Names are joined off the roster the picker already reads. */
  subscriberIds: number[]
  /** Hours logged against the task, in the same unit as `task.estimate`. */
  trackedTime: number | null
  pending: ActiveCollabTaskWriteField | null
  onScheduleChange: (schedule: ActiveCollabSchedule) => void
  onAssigneeIdChange: (assigneeId: number | null) => void
  onLabelToggle: (labelName: string) => void
  onHiddenFromClientsChange: (hidden: boolean) => void
  onImportantChange: (isImportant: boolean) => void
  onSubscribedChange: (userId: number, subscribed: boolean) => void
}

const META_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground'

/**
 * Hours as people write them: `8`, `2.5`, never `8.00` and never `2.4999999999`. ActiveCollab
 * stores both estimate and tracked time as fractional hours.
 */
function activeCollabHours(hours: number): string {
  return translate('auto.components.activecollab.task_workspace.hours', '{{value0}}h', {
    value0: Number(hours.toFixed(2)).toString()
  })
}

/**
 * Assignee, watchers, dates, priority and labels as a labelled list, TWO pairs to a row.
 *
 * Each value still gets a name, because unlabelled chrome forces the reader to guess: an
 * undifferentiated row of controls made a date box, an assignee and two label chips look like four
 * peer buttons. But one pair per row spent seven rows of a pane people mostly read, so the pairs
 * double up and fall back to a single column when the pane is too narrow to hold two — a container
 * query, not a viewport one, because this pane is resizable independently of the window.
 *
 * Completion is NOT here — it belongs with the title. Neither is the author: it reads as part of
 * the creation date, so it lives on the header's identity line.
 *
 * Read-only rows earn their place the same way: Estimate appears only when the instance has a
 * number to show, because "Estimate —" is a row that costs a line and says nothing.
 */
export function ActiveCollabTaskMetadataBar({
  task,
  subscriberIds,
  trackedTime,
  pending,
  onScheduleChange,
  onAssigneeIdChange,
  onLabelToggle,
  onHiddenFromClientsChange,
  onImportantChange,
  onSubscribedChange
}: ActiveCollabTaskMetadataBarProps): React.JSX.Element {
  const busy = pending !== null
  const showEffort = task.estimate !== null || trackedTime !== null

  return (
    // The container is this WRAPPER, not the grid: an element cannot query its own container, so
    // putting `@container` on the `dl` left its own column count stuck at the wide layout.
    <div className="@container/ac-meta border-b border-border/60">
      <dl className="grid grid-cols-[4.75rem_minmax(0,1fr)_4.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-2 @max-[30rem]/ac-meta:grid-cols-[4.75rem_minmax(0,1fr)]">
        <dt className={META_LABEL}>
          {translate('auto.components.activecollab.task_workspace.assignee', 'Assignee')}
        </dt>
        <dd className="flex min-w-0 items-center text-[12px]">
          <ActiveCollabTaskAssigneeField
            task={task}
            disabled={busy}
            busy={pending === 'assignee'}
            onChange={onAssigneeIdChange}
          />
        </dd>

        <dt className={META_LABEL}>
          {translate('auto.components.activecollab.task_workspace.due_date', 'Due date')}
        </dt>
        <dd className="min-w-0">
          <ActiveCollabTaskDueDateField
            // Remount per task so the popover and its draft range never carry over.
            key={task.id}
            startOn={task.startOn}
            dueOn={task.dueOn}
            disabled={busy}
            busy={pending === 'dueDate'}
            onChange={onScheduleChange}
          />
        </dd>

        <dt className={META_LABEL}>
          {translate('auto.components.activecollab.task_workspace.watchers', 'Watchers')}
        </dt>
        <dd className="flex min-w-0 items-center text-[12px]">
          <ActiveCollabTaskWatchers
            // Remount per task so the popover and the people it listed never carry over.
            key={task.id}
            projectId={task.projectId}
            subscriberIds={subscriberIds}
            disabled={busy}
            busy={pending === 'watchers'}
            onSubscribedChange={onSubscribedChange}
          />
        </dd>

        <dt className={META_LABEL}>
          {translate('auto.components.activecollab.task_workspace.priority', 'Priority')}
        </dt>
        <dd className="flex min-w-0 items-center gap-2 text-[12px]">
          {/* One control, two states, both named: a flag that only differs by fill would leave the
            reader guessing which way is set. */}
          <button
            type="button"
            aria-pressed={task.isImportant}
            disabled={busy}
            onClick={() => onImportantChange(!task.isImportant)}
            className={cn(
              '-ml-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-0.5 transition focus-visible:border-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
              task.isImportant
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/40'
            )}
          >
            <Flag className={cn('size-3', task.isImportant && 'fill-current')} />
            {task.isImportant
              ? translate('auto.components.activecollab.task_workspace.important', 'High')
              : translate('auto.components.activecollab.task_workspace.not_important', 'Normal')}
          </button>
          {pending === 'importance' ? (
            <LoaderCircle className="size-3 animate-spin text-muted-foreground" />
          ) : null}
        </dd>

        {showEffort ? (
          <>
            <dt className={META_LABEL}>
              {translate('auto.components.activecollab.task_workspace.estimate', 'Estimate')}
            </dt>
            {/* Read-only: time is logged against a task through ActiveCollab's timer, and a field
              that looks editable but is not is worse than a number you can only read. */}
            <dd
              className="flex min-w-0 items-center gap-1 text-[12px] tabular-nums"
              title={translate(
                'auto.components.activecollab.task_workspace.estimate_hint',
                'Tracked time and estimate, in hours'
              )}
            >
              {trackedTime === null ? null : (
                <span className="text-foreground">{activeCollabHours(trackedTime)}</span>
              )}
              {trackedTime !== null && task.estimate !== null ? (
                <span className="text-muted-foreground">/</span>
              ) : null}
              {task.estimate === null ? null : (
                <span
                  className={trackedTime === null ? 'text-foreground' : 'text-muted-foreground'}
                >
                  {activeCollabHours(task.estimate)}
                </span>
              )}
            </dd>
          </>
        ) : null}

        <dt className={META_LABEL}>
          {translate('auto.components.activecollab.task_workspace.clients', 'Clients')}
        </dt>
        <dd className="flex min-w-0 items-center gap-2 text-[12px]">
          <label className="flex cursor-pointer items-center gap-2 text-foreground">
            <Checkbox
              checked={task.isHiddenFromClients}
              disabled={busy}
              onCheckedChange={(checked) => onHiddenFromClientsChange(checked === true)}
            />
            {translate(
              'auto.components.activecollab.task_workspace.hidden_from_clients',
              'Hidden from clients'
            )}
          </label>
          {pending === 'visibility' ? (
            <LoaderCircle className="size-3 animate-spin text-muted-foreground" />
          ) : null}
        </dd>

        {/* Labels wrap, so they always start a fresh row and take the width of both pairs. */}
        <dt className={cn(META_LABEL, 'col-start-1 self-start pt-1')}>
          {translate('auto.components.activecollab.task_workspace.labels', 'Labels')}
        </dt>
        <dd className="col-span-3 flex min-w-0 flex-wrap items-center gap-1.5 @max-[30rem]/ac-meta:col-span-1">
          {task.labels.map((label) => (
            <ActiveCollabLabelChip key={label.id} label={label} />
          ))}
          <ActiveCollabLabelEditor
            labels={task.labels}
            disabled={busy}
            busy={pending === 'labels'}
            onToggle={onLabelToggle}
          />
        </dd>
      </dl>
    </div>
  )
}
