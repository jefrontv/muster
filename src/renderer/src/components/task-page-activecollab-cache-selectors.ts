// Reads the assigned-task list out of the store's page cache, so a row patched by a detail-pane
// write shows up in the list without a refetch.
//
// Pages are matched on the `page` the slice stamps into each entry rather than on a reconstructed
// cache key: duplicating the slice's key fragment here would let the two drift apart silently.
import type { CacheEntry } from '@/store/slices/github'
import type { ActiveCollabTaskPageRows } from '@/store/slices/activecollab-task-patch'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'

export type ActiveCollabAssignedTaskRows = {
  tasks: readonly ActiveCollabTask[]
  hasMore: boolean
  totalItems: number | null
  /** Contiguous pages held from page 1; the next page to request is this plus one. */
  loadedPages: number
}

const NO_ROWS: ActiveCollabAssignedTaskRows = {
  tasks: [],
  hasMore: false,
  totalItems: null,
  loadedPages: 0
}

/**
 * Flattens pages 1..`throughPage` into one list, stopping at the first gap — a page evicted
 * mid-scroll would otherwise splice later rows in out of order.
 *
 * The `cachePrefix` guard is load-bearing: two runtime environments share one cache object, and an
 * unscoped scan would serve the other environment's rows.
 *
 * Ids are deduplicated because the server list shifts under paging: a task completed between two
 * reads pushes its successor onto a page the caller already holds.
 */
export function selectActiveCollabAssignedTasks(
  cache: Record<string, CacheEntry<ActiveCollabTaskPageRows>>,
  cachePrefix: string,
  throughPage: number
): ActiveCollabAssignedTaskRows {
  const scopedPages = new Map<number, ActiveCollabTaskPageRows>()
  const prefix = `${cachePrefix}::`
  for (const [cacheKey, entry] of Object.entries(cache)) {
    if (entry?.data && cacheKey.startsWith(prefix)) {
      scopedPages.set(entry.data.page, entry.data)
    }
  }

  const tasks: ActiveCollabTask[] = []
  const seenTaskIds = new Set<number>()
  let hasMore = false
  let totalItems: number | null = null
  let loadedPages = 0

  for (let page = 1; page <= throughPage; page += 1) {
    const rows = scopedPages.get(page)
    if (!rows) {
      break
    }
    for (const task of rows.tasks) {
      // isCompleted: a locally completed row is patched back into the cache as completed and
      // would otherwise linger in the "assigned" list until the cache turns over.
      if (!seenTaskIds.has(task.id) && !task.isCompleted) {
        seenTaskIds.add(task.id)
        tasks.push(task)
      }
    }
    hasMore = rows.hasMore
    totalItems = totalItems ?? rows.totalItems
    loadedPages = page
  }

  return loadedPages === 0 ? NO_ROWS : { tasks, hasMore, totalItems, loadedPages }
}
