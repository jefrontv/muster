// My Work filter state and matching. Kept pure so the matcher is assertable without a DOM and the
// inactive path stays allocation-free: the list re-renders on every keystroke, so the empty filter
// must hand the caller's own array back rather than a copy.

import type { ActiveCollabTask } from '../../../shared/activecollab-types'

export type ActiveCollabMyWorkFilter = {
  text: string
  labelNames: string[]
  projectIds: number[]
}

export const EMPTY_ACTIVECOLLAB_MY_WORK_FILTER: ActiveCollabMyWorkFilter = {
  text: '',
  labelNames: [],
  projectIds: []
}

export function isActiveCollabMyWorkFilterActive(filter: ActiveCollabMyWorkFilter): boolean {
  return filter.text.trim() !== '' || filter.labelNames.length > 0 || filter.projectIds.length > 0
}

export function filterActiveCollabTasks(
  tasks: readonly ActiveCollabTask[],
  filter: ActiveCollabMyWorkFilter
): ActiveCollabTask[] {
  if (!isActiveCollabMyWorkFilterActive(filter)) {
    // Inactive is the common keystroke path; hand back the same array, no copy.
    return tasks as ActiveCollabTask[]
  }

  const text = filter.text.trim().toLowerCase()
  // A typed number matches the task number as a PREFIX on its decimal form, with an optional
  // leading '#': '#63', '63' and a partial '6' all find task 63, while '3' does not.
  const numberPrefix = text.startsWith('#') ? text.slice(1) : text

  return tasks.filter((task) => {
    if (filter.projectIds.length > 0 && !filter.projectIds.includes(task.projectId)) {
      return false
    }
    if (
      filter.labelNames.length > 0 &&
      !filter.labelNames.some((name) => task.labels.some((label) => label.name === name))
    ) {
      return false
    }
    if (text !== '') {
      const nameMatches = task.name.toLowerCase().includes(text)
      const numberMatches = numberPrefix !== '' && String(task.taskNumber).startsWith(numberPrefix)
      if (!nameMatches && !numberMatches) {
        return false
      }
    }
    return true
  })
}
