import React from 'react'

import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'
import { ActiveCollabPersonBadge } from './activecollab-task-person-badge'
import { ActiveCollabTaskAssigneeField } from './activecollab-task-assignee-field'
import { ActiveCollabTaskDueDateField } from './activecollab-task-due-date-field'
import { ActiveCollabLabelChip, ActiveCollabLabelEditor } from './activecollab-task-label-editor'
import type { ActiveCollabTaskWriteField } from './activecollab-task-writes'
import type { ActiveCollabSchedule } from './activecollab-task-schedule'

type ActiveCollabTaskMetadataBarProps = {
  task: ActiveCollabTask
  pending: ActiveCollabTaskWriteField | null
  onScheduleChange: (schedule: ActiveCollabSchedule) => void
  onAssigneeIdChange: (assigneeId: number | null) => void
  onLabelNamesChange: (labelNames: string[]) => void
}

const META_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground'

/**
 * Assignee, due date and labels as a labelled two-column list.
 *
 * Each value gets a name, because unlabelled chrome forces the reader to guess: an undifferentiated
 * row of controls made a date box, an assignee and two label chips look like four peer buttons.
 * Completion is NOT here — it belongs with the title, not among the fields it does not resemble.
 */
export function ActiveCollabTaskMetadataBar({
  task,
  pending,
  onScheduleChange,
  onAssigneeIdChange,
  onLabelNamesChange
}: ActiveCollabTaskMetadataBarProps): React.JSX.Element {
  const busy = pending !== null

  return (
    <dl className="grid flex-none grid-cols-[5.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 border-b border-border/60 px-4 py-3">
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
        {translate('auto.components.activecollab.task_workspace.created_by', 'Created by')}
      </dt>
      <dd className="flex min-w-0 items-center gap-2 text-[12px] text-foreground">
        <ActiveCollabPersonBadge name={task.createdByName} userId={task.createdById} />
        <span className="min-w-0 truncate">
          {task.createdByName ??
            translate('auto.components.activecollab.task_workspace.created_by_unknown', '—')}
        </span>
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

      <dt className={cn(META_LABEL, 'self-start pt-1')}>
        {translate('auto.components.activecollab.task_workspace.labels', 'Labels')}
      </dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
        {task.labels.map((label) => (
          <ActiveCollabLabelChip key={label.id} label={label} />
        ))}
        <ActiveCollabLabelEditor
          labels={task.labels}
          disabled={busy}
          busy={pending === 'labels'}
          onChange={onLabelNamesChange}
        />
      </dd>
    </dl>
  )
}
