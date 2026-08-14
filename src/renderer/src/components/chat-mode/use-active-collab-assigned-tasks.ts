// Chat mode's ambient view of the user's assigned ActiveCollab tasks (sidebar due badge, hero
// shortcuts). ONE shared subscription however many components mount it — each consumer used to
// run its own fetch and 5-minute interval, doubling API load and letting two surfaces disagree.
// Pages are read with the same duplicate/page-echo guards as the notification poller, so the
// badge is not silently under-counting past 100 open tasks. A midnight tick re-notifies with a
// fresh array identity so "due today" does not keep labelling yesterday's tasks in a window left
// open overnight.

import { useEffect, useSyncExternalStore } from 'react'
import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import { useAppStore } from '@/store'

const REFRESH_MS = 5 * 60 * 1000
/** 500 tasks — plenty for a due badge; the Tasks page owns real pagination. */
const MAX_BADGE_PAGES = 5

let snapshot: ActiveCollabTask[] | null = null
const listeners = new Set<() => void>()
let refreshTimer: number | null = null
let midnightTimer: number | null = null
let loading = false

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

/** A few seconds past midnight, so the tick lands on the new day even with timer drift. */
function msUntilNextMidnight(now: number): number {
  const next = new Date(now)
  next.setHours(24, 0, 5, 0)
  return next.getTime() - now
}

async function fetchAssignedPages(): Promise<ActiveCollabTask[] | null> {
  const tasks: ActiveCollabTask[] = []
  const seenIds = new Set<number>()
  for (let page = 1; page <= MAX_BADGE_PAGES; page += 1) {
    let result: Awaited<ReturnType<typeof window.api.activecollab.listAssignedTasks>>
    try {
      result = await window.api.activecollab.listAssignedTasks({ page })
    } catch {
      return null
    }
    if (!result.ok) {
      return null
    }
    let added = 0
    for (const task of result.value.tasks) {
      if (!seenIds.has(task.id)) {
        seenIds.add(task.id)
        tasks.push(task)
        added += 1
      }
    }
    // Same guards as the notification poller: some instances ignore `page` and reprint page 1
    // while the headers still claim more.
    const echoedPage = result.value.page
    if (
      page > 1 &&
      (added === 0 || (typeof echoedPage === 'number' && echoedPage > 0 && echoedPage < page))
    ) {
      break
    }
    if (!result.value.hasMore) {
      break
    }
  }
  return tasks
}

async function load(): Promise<void> {
  if (loading) {
    return
  }
  loading = true
  try {
    if (!useAppStore.getState().activeCollabStatus.configured) {
      if (snapshot !== null) {
        snapshot = null
        notify()
      }
      return
    }
    const tasks = await fetchAssignedPages()
    // A failed fetch keeps the last good answer: a stale badge beats a flickering one.
    if (tasks !== null) {
      snapshot = tasks
      notify()
    }
  } finally {
    loading = false
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    void load()
    refreshTimer = window.setInterval(() => void load(), REFRESH_MS)
    const armMidnight = (): void => {
      midnightTimer = window.setTimeout(() => {
        // Fresh identity, same rows: consumers re-render and re-bucket "due today" for the new day.
        snapshot = snapshot === null ? null : [...snapshot]
        notify()
        armMidnight()
      }, msUntilNextMidnight(Date.now()))
    }
    armMidnight()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      if (refreshTimer !== null) {
        window.clearInterval(refreshTimer)
        refreshTimer = null
      }
      if (midnightTimer !== null) {
        window.clearTimeout(midnightTimer)
        midnightTimer = null
      }
    }
  }
}

/** Test-only: drop the shared state so suites do not leak tasks into each other. */
export function _resetAssignedActiveCollabTasksForTests(): void {
  snapshot = null
  loading = false
}

export function useAssignedActiveCollabTasks(): ActiveCollabTask[] | null {
  const configured = useAppStore((s) => s.activeCollabStatus.configured)
  const tasks = useSyncExternalStore(subscribe, () => snapshot)
  // Connect/disconnect flips reload immediately rather than waiting out the interval.
  useEffect(() => {
    void load()
  }, [configured])
  return configured ? tasks : null
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
