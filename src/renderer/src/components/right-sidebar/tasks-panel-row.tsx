// One task in the sidebar list: a checkbox, the display number, the name, a label and a due date.
//
// Same fixed row height as the Tasks page list (h-12), so moving between the two surfaces does not
// feel like moving between two products. Fixed rather than minimum for the same reason it is fixed
// there: a labelled row must not stand taller than a bare one, or the list scans as an uneven stack.
//
// Two separate targets, not a label wrapping both: the checkbox picks the task for an agent and the
// name opens it. A label would fire the toggle on every click meant for the detail pane.

import { PanelRight } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { activeCollabLabelChipStyle } from '@/components/task-page-activecollab-row-presentation'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { ActiveCollabLabel, ActiveCollabTask } from '../../../../shared/activecollab-types'

/**
 * The first label, always whole.
 *
 * It never truncates: a clipped "COMPLETED ..." and a clipped "COMPLETED WITH NOTES" look the same,
 * so a half-shown label is worse than none. The task name absorbs the width instead, where the
 * number in front of it and the tooltip still identify the row.
 *
 * One label rather than the Tasks page's three: in a sidebar the second chip already costs more
 * width than the task name can spare, and the rest are on the task itself a click away. The count
 * of the others is not shown either, because a bare "+2" is a riddle, not information.
 */
function FirstLabelChip({ label }: { label: ActiveCollabLabel }): React.JSX.Element {
  const style = activeCollabLabelChipStyle(label.color)
  return (
    <span
      title={label.name}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
        !style && 'border-border/50 bg-muted/35 text-muted-foreground'
      )}
      style={style ?? undefined}
    >
      {label.name}
    </span>
  )
}

/** Overdue and due-today read differently, and only those two earn a colour. */
function dueTone(dueOn: number | null): string | null {
  if (dueOn === null) {
    return null
  }
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  if (dueOn < Date.now()) {
    return 'text-destructive'
  }
  return dueOn <= endOfToday.getTime() ? 'text-amber-600 dark:text-amber-400' : null
}

function dueLabel(dueOn: number): string {
  return new Date(dueOn).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function TasksPanelRow({
  task,
  selected,
  open,
  onToggle,
  onOpen
}: {
  task: ActiveCollabTask
  selected: boolean
  /** True while this task's detail fills the panel, so the row stays visibly the source. */
  open: boolean
  onToggle: () => void
  onOpen: () => void
}): React.JSX.Element {
  const tone = dueTone(task.dueOn)

  return (
    <div
      className={cn(
        'group flex h-12 items-center gap-2 border-b border-border/40 px-3 text-xs hover:bg-muted/40',
        (selected || open) && 'bg-muted/60'
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        aria-label={translate(
          'auto.components.right.sidebar.tasks.select_task',
          'Select {{name}}'
        ).replace('{{name}}', task.name)}
      />
      <button
        type="button"
        onClick={onOpen}
        title={task.name}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
      >
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          #{task.taskNumber}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{task.name}</span>
      </button>
      {task.labels[0] ? <FirstLabelChip label={task.labels[0]} /> : null}
      {task.dueOn !== null ? (
        <span className={cn('shrink-0 tabular-nums text-muted-foreground', tone)}>
          {dueLabel(task.dueOn)}
        </span>
      ) : null}
      <PanelRight
        aria-hidden
        className={cn(
          'size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100',
          open && 'opacity-100'
        )}
      />
    </div>
  )
}
