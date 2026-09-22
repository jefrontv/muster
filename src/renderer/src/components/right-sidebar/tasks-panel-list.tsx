// The grouped task list: a sticky task-list heading, then that list's tasks.
//
// Headings stick because the panel is short and the groups are long enough to scroll past their own
// name, which leaves a run of rows with no context.

import { TasksPanelRow } from './tasks-panel-row'
import type { TaskListGroup } from './tasks-panel-projection'
import type { ActiveCollabTask } from '../../../../shared/activecollab-types'

export function TasksPanelList({
  groups,
  selected,
  openTaskId,
  onToggle,
  onOpen
}: {
  groups: readonly TaskListGroup[]
  selected: ReadonlySet<number>
  openTaskId: number | null
  onToggle: (task: ActiveCollabTask) => void
  onOpen: (task: ActiveCollabTask) => void
}): React.JSX.Element {
  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
      {groups.map((group) => (
        <section key={group.taskListId ?? 'ungrouped'}>
          <h3 className="sticky top-0 z-10 border-b border-border/40 bg-muted/60 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
            {group.name}
          </h3>
          {group.tasks.map((task) => (
            <TasksPanelRow
              key={task.id}
              task={task}
              selected={selected.has(task.id)}
              open={openTaskId === task.id}
              onToggle={() => onToggle(task)}
              onOpen={() => onOpen(task)}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
