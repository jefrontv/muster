// Project grouping and the render order of the assigned-task list, kept out of the component so the
// ordering contract is assertable without a DOM — same split as deriveActiveCollabTaskListState.
//
// Every comparator here is TOTAL, not merely stable. The assigned-task endpoint returns rows in its
// own paging order and a refetch reorders equal-ranked rows freely, so a comparator that returned 0
// for two distinct rows would let the list reshuffle under the user between reads. Falling through
// to a unique id makes the output a function of the row SET alone, never of arrival order.
import type { ActiveCollabTask, ActiveCollabTaskList } from '../../../shared/activecollab-types'

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

export type ActiveCollabTaskListGroup = {
  /** Null groups tasks the project has not filed under any list. */
  taskListId: number | null
  taskListName: string
  tasks: ActiveCollabTask[]
}

/**
 * Groups a project's tasks by task list, in the PROJECT'S OWN list order — the lists are how the
 * project structured its work (see the source instance's board), so alphabetising them here would
 * shuffle a deliberate sequence. Lists the wire did not name sort after the named ones by id, and
 * unfiled tasks close the view. Named lists are kept even when EMPTY: each section carries the
 * quick-add composer, and a list you cannot add into because it happens to be empty is a trap.
 */
export function groupActiveCollabTasksByTaskList(
  tasks: readonly ActiveCollabTask[],
  taskLists: readonly ActiveCollabTaskList[]
): ActiveCollabTaskListGroup[] {
  const byListId = new Map<number | null, ActiveCollabTask[]>()
  for (const task of tasks) {
    const key = task.taskListId
    const bucket = byListId.get(key)
    if (bucket) {
      bucket.push(task)
    } else {
      byListId.set(key, [task])
    }
  }
  for (const bucket of byListId.values()) {
    bucket.sort(byDueDateThenNewest)
  }

  const groups: ActiveCollabTaskListGroup[] = []
  for (const list of taskLists) {
    groups.push({ taskListId: list.id, taskListName: list.name, tasks: byListId.get(list.id) ?? [] })
    byListId.delete(list.id)
  }
  const unnamed = [...byListId.entries()]
    .filter((entry): entry is [number, ActiveCollabTask[]] => entry[0] !== null)
    .sort((a, b) => a[0] - b[0])
  for (const [taskListId, bucket] of unnamed) {
    groups.push({ taskListId, taskListName: '', tasks: bucket })
  }
  const unfiled = byListId.get(null)
  if (unfiled) {
    groups.push({ taskListId: null, taskListName: '', tasks: unfiled })
  }
  return groups
}
