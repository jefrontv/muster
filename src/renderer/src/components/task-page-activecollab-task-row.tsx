// One row of the assigned-task list. Split out of the list so the container keeps only its load
// states and the project sections.
//
// Hierarchy: the task name is the single primary line; labels and the due date are secondary and
// live in their own regions of the row rather than running together with it.
import React from 'react'
import { Play } from 'lucide-react'

import { useActiveCollabStartWork } from './use-activecollab-start-work'
import { ACTIVECOLLAB_SITE_BINDING_UI_ENABLED } from '@/lib/activecollab-site-binding-visibility'

import {
  formatActiveCollabDueDate,
  type ActiveCollabDueDate
} from '@/components/activecollab-task-due-date'
import { translate } from '@/i18n/i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ActiveCollabPersonBadge } from './activecollab-task-person-badge'
import { cn } from '@/lib/utils'
import {
  activeCollabDueStatus,
  activeCollabLabelChipStyle,
  type ActiveCollabDueStatus
} from './task-page-activecollab-row-presentation'
import type { ActiveCollabTaskRef } from '../../../shared/activecollab-api-types'
import type { ActiveCollabLabel, ActiveCollabTask } from '../../../shared/activecollab-types'

/** Chips shown inline before the rest collapse into a `+N`. See the row's derivation comment. */
const ROW_LABEL_LIMIT = 2

const DUE_TONE_CLASS: Record<ActiveCollabDueStatus, string> = {
  overdue: 'text-destructive',
  today: 'text-foreground',
  upcoming: 'text-muted-foreground'
}

/** Urgency travels in words, not only in the destructive tint, so it survives without colour. */
function dueAccessibleFragment(label: string, status: ActiveCollabDueStatus): string {
  if (status === 'overdue') {
    return translate('auto.components.activecollab.task_list.row_overdue', 'overdue {{value0}}', {
      value0: label
    })
  }
  if (status === 'today') {
    return translate(
      'auto.components.activecollab.task_list.row_due_today',
      'due today {{value0}}',
      { value0: label }
    )
  }
  return translate('auto.components.activecollab.task_list.row_due', 'due {{value0}}', {
    value0: label
  })
}

/**
 * The project is announced but no longer printed: the row sits inside a list labelled by its
 * project, yet focus can land here directly from a tab jump, where that list context is not
 * guaranteed to be spoken.
 */
function taskRowAccessibleName(
  task: ActiveCollabTask,
  due: ActiveCollabDueDate | null,
  status: ActiveCollabDueStatus | null
): string {
  const parts = [
    translate('auto.components.activecollab.task_list.row_name', '{{value0}} in {{value1}}', {
      value0: task.name,
      value1: task.projectName
    })
  ]
  if (due && status) {
    parts.push(dueAccessibleFragment(due.label, status))
  }
  if (task.labels.length > 0) {
    parts.push(
      translate('auto.components.activecollab.task_list.row_labels', 'labels {{value0}}', {
        value0: task.labels.map((label) => label.name).join(', ')
      })
    )
  }
  return parts.join(', ')
}

function ActiveCollabLabelChip({ label }: { label: ActiveCollabLabel }): React.JSX.Element {
  const style = activeCollabLabelChipStyle(label.color)
  return (
    <span
      data-testid="activecollab-task-label"
      className={cn(
        'max-w-[140px] shrink-0 truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
        !style && 'border-border/50 bg-muted/35 text-muted-foreground'
      )}
      style={style ?? undefined}
    >
      {label.name}
    </span>
  )
}

const DUE_BADGE_CLASS =
  'rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide'

function ActiveCollabTaskDue({
  due,
  status
}: {
  due: ActiveCollabDueDate | null
  status: ActiveCollabDueStatus | null
}): React.JSX.Element {
  if (!due || !status) {
    return (
      <span className="shrink-0 text-[11px] text-muted-foreground/70">
        {translate('auto.components.activecollab.task_list.no_due_date', 'No due date')}
      </span>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {status === 'overdue' ? (
        <span
          className={cn(
            DUE_BADGE_CLASS,
            'border-destructive/40 bg-destructive/10 text-destructive'
          )}
        >
          {translate('auto.components.activecollab.task_list.due_overdue', 'Overdue')}
        </span>
      ) : null}
      {status === 'today' ? (
        <span className={cn(DUE_BADGE_CLASS, 'border-border/60 bg-muted/50 text-foreground')}>
          {translate('auto.components.activecollab.task_list.due_today', 'Today')}
        </span>
      ) : null}
      <time dateTime={due.iso} className={cn('text-[12px] tabular-nums', DUE_TONE_CLASS[status])}>
        {due.label}
      </time>
    </span>
  )
}

export function ActiveCollabTaskRow({
  now,
  onSelect,
  selected,
  showAssignee = false,
  task
}: {
  /** One clock reading per list render, so no two rows can straddle midnight. */
  now: number
  onSelect: (ref: ActiveCollabTaskRef) => void
  selected: boolean
  /** Project views show who holds each task; the assigned-to-me list omits it (always you). */
  showAssignee?: boolean
  task: ActiveCollabTask
}): React.JSX.Element {
  // `dueOn` is already anchored to the local calendar day; re-deriving it from UTC would read a
  // day early east of UTC.
  const due = formatActiveCollabDueDate(task.dueOn)
  const status = task.dueOn !== null && due ? activeCollabDueStatus(task.dueOn, now) : null
  const { binding, startWork } = useActiveCollabStartWork(task.projectId)
  // Only offered when it can actually succeed: an unbound project has nowhere to put a workspace,
  // and a control that explains its own absence belongs in the detail pane, not on every row.
  const canStartWork =
    ACTIVECOLLAB_SITE_BINDING_UI_ENABLED &&
    (binding.kind === 'ready' || binding.kind === 'needs-repo')
  const startWorkLabel = translate(
    'auto.components.activecollab.task_row.start_work',
    'Start a workspace for this task'
  )
  // Two chips is what fits beside a truncated title at the narrowest pane width; the rest collapse
  // into a count whose tooltip still names them, and the row's aria-label lists every label
  // regardless, so capping is presentation-only and hides nothing from assistive tech.
  const visibleLabels = task.labels.slice(0, ROW_LABEL_LIMIT)
  const hiddenLabels = task.labels.slice(ROW_LABEL_LIMIT)
  const hiddenLabelCount = hiddenLabels.length
  const hiddenLabelNames = hiddenLabels.map((label) => label.name).join(', ')

  return (
    // `group` drives the hover reveal; flex rather than an overlay so the action never covers the
    // due date, and the space is reserved whenever it can appear so hovering causes no layout shift.
    <li className="group flex items-center">
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        data-current={selected ? 'true' : undefined}
        aria-label={taskRowAccessibleName(task, due, status)}
        onClick={() => onSelect({ projectId: task.projectId, taskId: task.id })}
        className={cn(
          // Why a FIXED height rather than a minimum: labels used to wrap onto a second line, so a
          // labelled row stood taller than a bare one and the list scanned as an uneven stack.
          'grid h-12 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
          // Selected outranks hover instead of matching it, so pointing at a row never looks like
          // selecting one.
          selected ? 'bg-accent hover:bg-accent' : 'hover:bg-accent/40'
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            #{task.taskNumber}
          </span>
          <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
            {task.name}
          </span>
          {visibleLabels.length > 0 ? (
            // shrink-0 so the chips keep their shape and the TITLE truncates instead; capped at
            // ROW_LABEL_LIMIT so a task carrying six labels cannot crowd the name out entirely.
            <span className="flex shrink-0 items-center gap-1">
              {visibleLabels.map((label) => (
                <ActiveCollabLabelChip key={label.id} label={label} />
              ))}
              {hiddenLabelCount > 0 ? (
                <span
                  aria-hidden="true"
                  title={hiddenLabelNames}
                  className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
                >
                  +{hiddenLabelCount}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          {showAssignee && task.assigneeId !== null ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0">
                  <ActiveCollabPersonBadge name={task.assigneeName} userId={task.assigneeId} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {task.assigneeName ??
                  translate(
                    'auto.components.activecollab.task_row.assignee_unresolved',
                    'Assigned'
                  )}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <ActiveCollabTaskDue due={due} status={status} />
        </span>
      </button>
      {canStartWork ? (
        <button
          type="button"
          aria-label={startWorkLabel}
          title={startWorkLabel}
          onClick={() => startWork(task)}
          className="mr-2 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100"
        >
          <Play aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
    </li>
  )
}
