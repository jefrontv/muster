// ActiveCollab task mutations. Each write settles the same way: on a returned row, patch it into
// every cache holding the task; on the `ok: true` + null echo, mark those entries stale so the next
// read refetches. A null echo is neither a failure nor a reason to drop the row.
import type {
  ActiveCollabComment,
  ActiveCollabSubtask,
  ActiveCollabSubtaskUpdate,
  ActiveCollabTask,
  ActiveCollabTaskUpdate
} from '../../../../shared/activecollab-types'
import type {
  ActiveCollabFailure,
  ActiveCollabResult,
  ActiveCollabTaskRef
} from '../../../../shared/activecollab-api-types'
import {
  getTaskSourceCacheScope,
  type TaskSourceContext
} from '../../../../shared/task-source-context'
import {
  activeCollabCompleteTask,
  activeCollabPostComment,
  activeCollabReopenTask,
  activeCollabUpdateTask
} from '@/runtime/runtime-activecollab-client'
import type {
  ActiveCollabRuntimeSettings,
  ActiveCollabStoreGet,
  ActiveCollabStoreSet
} from './activecollab-cache'
import { shouldRefreshStatusAfterFailure } from './activecollab-failure'
import { appendActiveCollabCommentInCaches } from './activecollab-detail-patch'
import { createActiveCollabDetailWriteActions } from './activecollab-detail-writes'
import {
  patchActiveCollabTaskInCaches,
  staleActiveCollabTaskInCaches
} from './activecollab-task-patch'
import type { ActiveCollabCacheState } from './activecollab-task-patch'

export type ActiveCollabWriteOptions = { sourceContext?: TaskSourceContext | null }

export type ActiveCollabWriteActions = {
  updateActiveCollabTask: (
    args: ActiveCollabTaskRef & { update: ActiveCollabTaskUpdate },
    options?: ActiveCollabWriteOptions
  ) => Promise<ActiveCollabResult<ActiveCollabTask | null>>
  completeActiveCollabTask: (
    args: { taskId: number },
    options?: ActiveCollabWriteOptions
  ) => Promise<ActiveCollabResult<ActiveCollabTask | null>>
  reopenActiveCollabTask: (
    args: { taskId: number },
    options?: ActiveCollabWriteOptions
  ) => Promise<ActiveCollabResult<ActiveCollabTask | null>>
  postActiveCollabComment: (
    args: { taskId: number; bodyHtml: string; attachmentCodes?: string[] },
    options?: ActiveCollabWriteOptions
  ) => Promise<ActiveCollabResult<ActiveCollabComment | null>>
  createActiveCollabSubtask: (
    args: {
      projectId: number
      taskId: number
      name: string
      assigneeId?: number | null
      dueOn?: number | null
    },
    options?: ActiveCollabWriteOptions
  ) => Promise<ActiveCollabResult<ActiveCollabSubtask | null>>
  updateActiveCollabSubtask: (
    args: {
      projectId: number
      taskId: number
      subtaskId: number
      update: ActiveCollabSubtaskUpdate
    },
    options?: ActiveCollabWriteOptions
  ) => Promise<ActiveCollabResult<ActiveCollabSubtask | null>>
  setActiveCollabSubtaskCompletion: (
    args: { taskId: number; subtaskId: number; isCompleted: boolean },
    options?: ActiveCollabWriteOptions
  ) => Promise<ActiveCollabResult<ActiveCollabSubtask | null>>
  updateActiveCollabComment: (
    args: { taskId: number; commentId: number; bodyHtml: string },
    options?: ActiveCollabWriteOptions
  ) => Promise<ActiveCollabResult<ActiveCollabComment | null>>
  deleteActiveCollabComment: (
    args: { taskId: number; commentId: number },
    options?: ActiveCollabWriteOptions
  ) => Promise<ActiveCollabResult<null>>
  setActiveCollabTaskSubscription: (
    args: { taskId: number; userId: number; subscribed: boolean },
    options?: ActiveCollabWriteOptions
  ) => Promise<ActiveCollabResult<null>>
  /** Fan a known-good row into every cache holding it, without a round trip. */
  patchActiveCollabTask: (task: ActiveCollabTask, options?: ActiveCollabWriteOptions) => void
  /** Mark a task's cached rows stale so the next read refetches, leaving the rows readable. */
  invalidateActiveCollabTask: (taskId: number, options?: ActiveCollabWriteOptions) => void
}

/**
 * Null when no source context is supplied: the patch then reaches every scope holding the task,
 * because an untargeted write has no basis for deciding which context's rows are stale.
 */
function writeCachePrefix(options?: ActiveCollabWriteOptions): string | null {
  return options?.sourceContext?.provider === 'activecollab'
    ? getTaskSourceCacheScope(options.sourceContext)
    : null
}

function noteFailure(
  set: ActiveCollabStoreSet,
  get: ActiveCollabStoreGet,
  failure: ActiveCollabFailure
): void {
  set({ activeCollabLastError: failure.error, activeCollabLastFailureKind: failure.kind })
  if (shouldRefreshStatusAfterFailure(failure)) {
    void get().checkActiveCollabConnection()
  }
}

function settleTaskWrite(
  set: ActiveCollabStoreSet,
  get: ActiveCollabStoreGet,
  taskId: number,
  prefix: string | null,
  result: ActiveCollabResult<ActiveCollabTask | null>
): void {
  if (!result.ok) {
    noteFailure(set, get, result)
    return
  }
  const row = result.value
  set((s) => ({
    ...(row
      ? patchActiveCollabTaskInCaches(s, row, prefix)
      : staleActiveCollabTaskInCaches(s, taskId, prefix)),
    activeCollabLastError: null,
    activeCollabLastFailureKind: null
  }))
}

/** The two caches task-detail writes touch; the project/list caches are handled separately. */
export type ActiveCollabTaskCaches = Pick<
  ActiveCollabCacheState,
  'activeCollabTaskPageCache' | 'activeCollabTaskDetailCache'
>

/**
 * Apply a detail edit optimistically and hand back a guard that restores the prior cache objects —
 * but only if no later write replaced them, so a concurrent set is never clobbered by a stale rollback.
 */
function optimisticPatch(
  get: ActiveCollabStoreGet,
  set: ActiveCollabStoreSet,
  edit: (state: ActiveCollabTaskCaches) => Partial<ActiveCollabTaskCaches>
): () => void {
  const beforeDetail = get().activeCollabTaskDetailCache
  const beforePage = get().activeCollabTaskPageCache
  const patch = edit(get())
  const afterDetail = patch.activeCollabTaskDetailCache
  const afterPage = patch.activeCollabTaskPageCache
  set(patch)
  return () => {
    set((s) => ({
      ...(afterDetail !== undefined && s.activeCollabTaskDetailCache === afterDetail
        ? { activeCollabTaskDetailCache: beforeDetail }
        : {}),
      ...(afterPage !== undefined && s.activeCollabTaskPageCache === afterPage
        ? { activeCollabTaskPageCache: beforePage }
        : {})
    }))
  }
}

/**
 * Settle a subtask/comment write that already applied optimistically: reconcile with the returned
 * row, or mark the task stale when the write landed but echoed nothing usable.
 */
function settleDetailWrite<T>(
  set: ActiveCollabStoreSet,
  taskId: number,
  prefix: string | null,
  /** Null means the write LANDED and the server echoed nothing usable: refetch, not failure. */
  row: T | null,
  reconcile: (state: ActiveCollabTaskCaches, row: T) => Partial<ActiveCollabTaskCaches>
): void {
  set((s) => ({
    ...(row ? reconcile(s, row) : staleActiveCollabTaskInCaches(s, taskId, prefix)),
    activeCollabLastError: null,
    activeCollabLastFailureKind: null
  }))
}

export function createActiveCollabWriteActions(
  set: ActiveCollabStoreSet,
  get: ActiveCollabStoreGet
): ActiveCollabWriteActions {
  const settingsFor = (options?: ActiveCollabWriteOptions): ActiveCollabRuntimeSettings =>
    options?.sourceContext ?? get().settings

  const detailActions = createActiveCollabDetailWriteActions({
    set,
    get,
    writeCachePrefix,
    noteFailure,
    optimisticPatch,
    settleDetailWrite,
    settingsFor
  })

  return {
    updateActiveCollabTask: async (args, options) => {
      const result = await activeCollabUpdateTask(args, settingsFor(options))
      settleTaskWrite(set, get, args.taskId, writeCachePrefix(options), result)
      return result
    },

    completeActiveCollabTask: async (args, options) => {
      const result = await activeCollabCompleteTask(args, settingsFor(options))
      settleTaskWrite(set, get, args.taskId, writeCachePrefix(options), result)
      return result
    },

    reopenActiveCollabTask: async (args, options) => {
      const result = await activeCollabReopenTask(args, settingsFor(options))
      settleTaskWrite(set, get, args.taskId, writeCachePrefix(options), result)
      return result
    },

    postActiveCollabComment: async (args, options) => {
      const result = await activeCollabPostComment(args, settingsFor(options))
      if (!result.ok) {
        noteFailure(set, get, result)
        return result
      }
      const comment = result.value
      const prefix = writeCachePrefix(options)
      set((s) => ({
        ...(comment
          ? appendActiveCollabCommentInCaches(s, args.taskId, comment, prefix)
          : staleActiveCollabTaskInCaches(s, args.taskId, prefix)),
        activeCollabLastError: null,
        activeCollabLastFailureKind: null
      }))
      return result
    },

    ...detailActions,

    patchActiveCollabTask: (task, options) => {
      const prefix = writeCachePrefix(options)
      set((s) => patchActiveCollabTaskInCaches(s, task, prefix))
    },

    invalidateActiveCollabTask: (taskId, options) => {
      const prefix = writeCachePrefix(options)
      set((s) => staleActiveCollabTaskInCaches(s, taskId, prefix))
    }
  }
}
