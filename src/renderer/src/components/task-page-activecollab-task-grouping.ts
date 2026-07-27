// Project grouping and the render order of the assigned-task list, kept out of the component so the
// ordering contract is assertable without a DOM — same split as deriveActiveCollabTaskListState.
//
// Every comparator here is TOTAL, not merely stable. The assigned-task endpoint returns rows in its
// own paging order and a refetch reorders equal-ranked rows freely, so a comparator that returned 0
// for two distinct rows would let the list reshuffle under the user between reads. Falling through
// to a unique id makes the output a function of the row SET alone, never of arrival order.
import type { ActiveCollabTask } from '../../../shared/activecollab-types'

export type ActiveCollabTaskGroup = {
  /** Grouping key: projects are identified by id, so two same-named projects stay apart. */
  projectId: number
  projectName: string
  tasks: ActiveCollabTask[]
}

/**
 * Groups: project name A→Z (case-insensitive), then project id ascending.
 *
 * `sensitivity: 'base'` keeps "Website" and "website" adjacent instead of exiling the lowercase one
 * past Z, which is where a raw code-unit compare would put it.
 */
function byProjectName(a: ActiveCollabTaskGroup, b: ActiveCollabTaskGroup): number {
  const name = a.projectName.localeCompare(b.projectName, undefined, { sensitivity: 'base' })
  return name === 0 ? a.projectId - b.projectId : name
}

/**
 * Within a project: due date ascending, undated last, then task id descending.
 *
 * Deadline first because that is the axis the user triages on; undated tasks carry no deadline to
 * miss, so they sink below every dated one rather than sorting as "the epoch". Newest-first breaks
 * the remaining ties so a task added today surfaces above its same-day siblings.
 */
function byDueDateThenNewest(a: ActiveCollabTask, b: ActiveCollabTask): number {
  const dueA = a.dueOn ?? Number.POSITIVE_INFINITY
  const dueB = b.dueOn ?? Number.POSITIVE_INFINITY
  // Guarded before the subtraction: two undated tasks would otherwise compare Infinity - Infinity.
  return dueA === dueB ? b.id - a.id : dueA - dueB
}

export function groupActiveCollabTasksByProject(
  tasks: readonly ActiveCollabTask[]
): ActiveCollabTaskGroup[] {
  const groups = new Map<number, ActiveCollabTaskGroup>()
  for (const task of tasks) {
    const group = groups.get(task.projectId)
    if (group) {
      group.tasks.push(task)
    } else {
      groups.set(task.projectId, {
        projectId: task.projectId,
        projectName: task.projectName,
        tasks: [task]
      })
    }
  }

  const sorted = [...groups.values()]
  for (const group of sorted) {
    group.tasks.sort(byDueDateThenNewest)
  }
  return sorted.sort(byProjectName)
}
