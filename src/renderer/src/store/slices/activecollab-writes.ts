// ActiveCollab task mutations. Each write settles the same way: on a returned row, patch it into
// every cache holding the task; on the `ok: true` + null echo, mark those entries stale so the next
// read refetches. A null echo is neither a failure nor a reason to drop the row.
import type {
  ActiveCollabComment,
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
import {
  appendActiveCollabCommentInCaches,
  patchActiveCollabTaskInCaches,
  staleActiveCollabTaskInCaches
} from './activecollab-task-patch'

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
    args: { taskId: number; bodyHtml: string },
    options?: ActiveCollabWriteOptions
  ) => Promise<ActiveCollabResult<ActiveCollabComment | null>>
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

export function createActiveCollabWriteActions(
  set: ActiveCollabStoreSet,
  get: ActiveCollabStoreGet
): ActiveCollabWriteActions {
  const settingsFor = (options?: ActiveCollabWriteOptions): ActiveCollabRuntimeSettings =>
    options?.sourceContext ?? get().settings

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
