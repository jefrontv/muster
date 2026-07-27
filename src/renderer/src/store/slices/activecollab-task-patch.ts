// The ActiveCollab cache topology, and the fan-out that keeps one task row consistent across every
// cache that holds it. A write returns one authoritative row; dropping whole caches instead of
// threading it through would blank the list the user is looking at.
import type { CacheEntry } from './github'
import type {
  ActiveCollabComment,
  ActiveCollabLabel,
  ActiveCollabProject,
  ActiveCollabTask,
  ActiveCollabTaskDetail,
  ActiveCollabUser
} from '../../../../shared/activecollab-types'

/** One assigned-task page, flattened so the list reads rows and paging out of a single entry. */
export type ActiveCollabTaskPageRows = {
  tasks: ActiveCollabTask[]
  hasMore: boolean
  totalItems: number | null
  page: number
}

export type ActiveCollabCacheState = {
  activeCollabTaskPageCache: Record<string, CacheEntry<ActiveCollabTaskPageRows>>
  activeCollabProjectCache: Record<string, CacheEntry<ActiveCollabProject[]>>
  activeCollabTaskDetailCache: Record<string, CacheEntry<ActiveCollabTaskDetail>>
  activeCollabLabelCache: Record<string, CacheEntry<ActiveCollabLabel[]>>
  activeCollabUserCache: Record<string, CacheEntry<ActiveCollabUser[]>>
}

/** Only these two hold task rows; projects, labels and people are vocabulary, not per-task state. */
type TaskCaches = Pick<
  ActiveCollabCacheState,
  'activeCollabTaskPageCache' | 'activeCollabTaskDetailCache'
>

type TaskCacheEdit = {
  detail?: (detail: ActiveCollabTaskDetail) => ActiveCollabTaskDetail
  detailFetchedAt?: number
  row?: (task: ActiveCollabTask) => ActiveCollabTask
  rowFetchedAt?: number
}

function editTaskCaches(
  state: TaskCaches,
  taskId: number,
  cachePrefix: string | null,
  edit: TaskCacheEdit
): Partial<TaskCaches> {
  const inScope = (key: string): boolean =>
    cachePrefix === null || key.startsWith(`${cachePrefix}::`)
  let changed = false

  const nextDetailCache = { ...state.activeCollabTaskDetailCache }
  for (const [key, entry] of Object.entries(nextDetailCache)) {
    const detail = entry?.data
    if (!detail || detail.task.id !== taskId || !inScope(key)) {
      continue
    }
    nextDetailCache[key] = {
      ...entry,
      data: edit.detail ? edit.detail(detail) : detail,
      fetchedAt: edit.detailFetchedAt ?? entry.fetchedAt
    }
    changed = true
  }

  const nextPageCache = { ...state.activeCollabTaskPageCache }
  for (const [key, entry] of Object.entries(nextPageCache)) {
    const page = entry?.data
    if (!page || !inScope(key)) {
      continue
    }
    const index = page.tasks.findIndex((task) => task.id === taskId)
    const current = index === -1 ? undefined : page.tasks[index]
    if (!current) {
      continue
    }
    const tasks = [...page.tasks]
    tasks[index] = edit.row ? edit.row(current) : current
    nextPageCache[key] = {
      ...entry,
      data: { ...page, tasks },
      fetchedAt: edit.rowFetchedAt ?? entry.fetchedAt
    }
    changed = true
  }

  return changed
    ? { activeCollabTaskDetailCache: nextDetailCache, activeCollabTaskPageCache: nextPageCache }
    : {}
}

/**
 * Detail entries go stale even though they were just patched: the row is authoritative but the
 * comment thread beside it is not. List entries keep their freshness — a patched row is a good row.
 */
export function patchActiveCollabTaskInCaches(
  state: TaskCaches,
  task: ActiveCollabTask,
  cachePrefix: string | null
): Partial<TaskCaches> {
  return editTaskCaches(state, task.id, cachePrefix, {
    detail: (detail) => ({ ...detail, task }),
    detailFetchedAt: 0,
    row: () => task
  })
}

/**
 * The `ok: true` + null-value echo: the write landed but the instance returned no usable row. Rows
 * stay put and nothing reports an error — they are only marked stale so the next read refetches.
 */
export function staleActiveCollabTaskInCaches(
  state: TaskCaches,
  taskId: number,
  cachePrefix: string | null
): Partial<TaskCaches> {
  return editTaskCaches(state, taskId, cachePrefix, { detailFetchedAt: 0, rowFetchedAt: 0 })
}

/** Keeps the thread and its badge in step so a posted comment shows before the next detail read. */
export function appendActiveCollabCommentInCaches(
  state: TaskCaches,
  taskId: number,
  comment: ActiveCollabComment,
  cachePrefix: string | null
): Partial<TaskCaches> {
  return editTaskCaches(state, taskId, cachePrefix, {
    detail: (detail) => ({
      ...detail,
      task: { ...detail.task, commentCount: detail.task.commentCount + 1 },
      comments: [...detail.comments, comment]
    }),
    // Stale, not dropped: the instance may render the body differently than we echoed it.
    detailFetchedAt: 0,
    row: (task) => ({ ...task, commentCount: task.commentCount + 1 })
  })
}
