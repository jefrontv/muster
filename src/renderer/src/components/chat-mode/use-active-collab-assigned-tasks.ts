// Chat mode's ambient view of the user's assigned ActiveCollab tasks (sidebar
// due badge, hero shortcuts). One fetch per mount + a slow refresh; the Tasks
// page keeps its own richer polling.

import { useEffect, useState } from 'react'
import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import { useAppStore } from '@/store'

const REFRESH_MS = 5 * 60 * 1000

export function useAssignedActiveCollabTasks(): ActiveCollabTask[] | null {
  const configured = useAppStore((s) => s.activeCollabStatus.configured)
  const [tasks, setTasks] = useState<ActiveCollabTask[] | null>(null)

  useEffect(() => {
    if (!configured) {
      setTasks(null)
      return
    }
    let cancelled = false
    const load = (): void => {
      void window.api.activecollab
        .listAssignedTasks()
        .then((result) => {
          if (!cancelled && result.ok) {
            setTasks(result.value.tasks)
          }
        })
        .catch(() => undefined)
    }
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [configured])

  return tasks
}

/** Open tasks that need attention, most urgent first: overdue, then due soonest,
 *  then the rest by due date presence. */
export function urgentActiveCollabTasks(
  tasks: ActiveCollabTask[],
  now: number
): ActiveCollabTask[] {
  return tasks
    .filter((task) => !task.isCompleted)
    .sort((a, b) => (a.dueOn ?? Number.MAX_SAFE_INTEGER) - (b.dueOn ?? Number.MAX_SAFE_INTEGER))
    .sort((a, b) => Number(isOverdue(b, now)) - Number(isOverdue(a, now)))
}

export function isOverdue(task: ActiveCollabTask, now: number): boolean {
  return !task.isCompleted && task.dueOn !== null && task.dueOn < startOfDay(now)
}

export function isDueToday(task: ActiveCollabTask, now: number): boolean {
  if (task.isCompleted || task.dueOn === null) {
    return false
  }
  const start = startOfDay(now)
  return task.dueOn >= start && task.dueOn < start + 24 * 60 * 60 * 1000
}

function startOfDay(now: number): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}
