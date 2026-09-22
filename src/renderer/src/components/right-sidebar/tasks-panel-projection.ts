// Turning one project's open tasks into "my tasks, grouped by task list", in display order.
//
// The source changed during the build. It was `listAssignedTasks` filtered by project, chosen
// because it is paged on the short axis. But assigned tasks carry `taskListId` without the task
// LIST NAMES, and the panel now groups by task list, so that route needed a second call to resolve
// names. `listProjectTasks` answers tasks and task lists in one request, so it is one round trip
// instead of two-to-four, at the cost of fetching other people's tasks and discarding them here.
// For a project with a hundred open tasks that is the better trade.

import type {
  ActiveCollabProjectTasks,
  ActiveCollabTask,
  ActiveCollabTaskList
} from '../../../../shared/activecollab-types'

export type TaskListGroup = {
  /** Null for tasks that sit in no list, which ActiveCollab allows. */
  taskListId: number | null
  name: string
  tasks: ActiveCollabTask[]
}

/** Shown for tasks with no task list, rather than leaving the group header blank. */
export const UNGROUPED_TASK_LIST_NAME = 'No task list'

export function myOpenTasks(
  project: ActiveCollabProjectTasks | null | undefined,
  userId: number | null
): ActiveCollabTask[] {
  if (!project || userId === null) {
    return []
  }
  return project.tasks.filter((task) => !task.isCompleted && task.assigneeId === userId)
}

/**
 * Groups by task list, keeping the order ActiveCollab gave the lists.
 *
 * That order is the one the person arranged in ActiveCollab, so it carries intent that sorting
 * alphabetically would throw away. Lists with none of my tasks are dropped: an empty group is a
 * header explaining that there is nothing to see.
 */
export function groupByTaskList(
  tasks: readonly ActiveCollabTask[],
  taskLists: readonly ActiveCollabTaskList[]
): TaskListGroup[] {
  const byList = new Map<number | null, ActiveCollabTask[]>()
  for (const task of tasks) {
    const key = task.taskListId ?? null
    const bucket = byList.get(key)
    if (bucket) {
      bucket.push(task)
    } else {
      byList.set(key, [task])
    }
  }
  const groups: TaskListGroup[] = []
  for (const list of taskLists) {
    const found = byList.get(list.id)
    if (found) {
      groups.push({ taskListId: list.id, name: list.name, tasks: found.sort(compareForDisplay) })
      byList.delete(list.id)
    }
  }
  // Whatever is left belongs to a list this response did not name, or to no list at all. Both end
  // up last rather than being dropped, because a task nobody can see is worse than an odd header.
  const remaining = [...byList.values()].flat()
  if (remaining.length > 0) {
    groups.push({
      taskListId: null,
      name: UNGROUPED_TASK_LIST_NAME,
      tasks: remaining.sort(compareForDisplay)
    })
  }
  return groups
}

/**
 * Due soonest first, then the newest task number.
 *
 * Why due date leads: the panel answers "what should I pick up", and a date is the only field in
 * the row that carries urgency. Undated tasks sort after every dated one rather than being treated
 * as due at the epoch, which is what a null-to-zero comparison would do.
 */
export function compareForDisplay(left: ActiveCollabTask, right: ActiveCollabTask): number {
  if (left.dueOn !== right.dueOn) {
    if (left.dueOn === null) {
      return 1
    }
    if (right.dueOn === null) {
      return -1
    }
    return left.dueOn - right.dueOn
  }
  return right.taskNumber - left.taskNumber
}
