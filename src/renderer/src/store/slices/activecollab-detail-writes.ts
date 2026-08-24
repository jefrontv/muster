// Detail-level ActiveCollab write actions: subtask lifecycle, comment edit/delete and subscription
// toggles. They all apply an optimistic patch first and settle through the shared plumbing handed
// in by `activecollab-writes`, so they never duplicate how a write reconciles or rolls back.
import type { ActiveCollabSubtask } from '../../../../shared/activecollab-types'
import type { ActiveCollabFailure } from '../../../../shared/activecollab-api-types'
import {
  activeCollabCompleteSubtask,
  activeCollabCreateSubtask,
  activeCollabDeleteComment,
  activeCollabReopenSubtask,
  activeCollabSetTaskSubscription,
  activeCollabUpdateComment,
  activeCollabUpdateSubtask
} from '@/runtime/runtime-activecollab-client'
import type {
  ActiveCollabRuntimeSettings,
  ActiveCollabStoreGet,
  ActiveCollabStoreSet
} from './activecollab-cache'
import {
  appendActiveCollabSubtaskInCaches,
  editActiveCollabCommentBodyInCaches,
  editActiveCollabSubtaskInCaches,
  reconcileCreatedSubtaskInCaches,
  removeActiveCollabCommentInCaches,
  replaceActiveCollabCommentInCaches,
  replaceActiveCollabSubtaskInCaches,
  setActiveCollabSubtaskCompletionInCaches,
  toggleActiveCollabSubscriberInCaches
} from './activecollab-detail-patch'
import type {
  ActiveCollabTaskCaches,
  ActiveCollabWriteActions,
  ActiveCollabWriteOptions
} from './activecollab-writes'

/** The plumbing shared with the task-level writes, injected so this module stays cycle-free. */
export type ActiveCollabDetailWriteDeps = {
  set: ActiveCollabStoreSet
  get: ActiveCollabStoreGet
  writeCachePrefix: (options?: ActiveCollabWriteOptions) => string | null
  noteFailure: (
    set: ActiveCollabStoreSet,
    get: ActiveCollabStoreGet,
    failure: ActiveCollabFailure
  ) => void
  optimisticPatch: (
    get: ActiveCollabStoreGet,
    set: ActiveCollabStoreSet,
    edit: (state: ActiveCollabTaskCaches) => Partial<ActiveCollabTaskCaches>
  ) => () => void
  settleDetailWrite: <T>(
    set: ActiveCollabStoreSet,
    taskId: number,
    prefix: string | null,
    row: T | null,
    reconcile: (state: ActiveCollabTaskCaches, row: T) => Partial<ActiveCollabTaskCaches>
  ) => void
  settingsFor: (options?: ActiveCollabWriteOptions) => ActiveCollabRuntimeSettings
}

let optimisticSubtaskSeed = 0
function nextOptimisticSubtaskId(): number {
  optimisticSubtaskSeed -= 1
  return optimisticSubtaskSeed
}

function buildOptimisticSubtask(args: {
  taskId: number
  name: string
  assigneeId?: number | null
  dueOn?: number | null
}): ActiveCollabSubtask {
  return {
    id: nextOptimisticSubtaskId(),
    taskId: args.taskId,
    name: args.name,
    isCompleted: false,
    assigneeId: args.assigneeId ?? null,
    assigneeName: null,
    dueOn: args.dueOn ?? null,
    createdOn: null
  }
}

export function createActiveCollabDetailWriteActions(
  deps: ActiveCollabDetailWriteDeps
): Pick<
  ActiveCollabWriteActions,
  | 'createActiveCollabSubtask'
  | 'updateActiveCollabSubtask'
  | 'setActiveCollabSubtaskCompletion'
  | 'updateActiveCollabComment'
  | 'deleteActiveCollabComment'
  | 'setActiveCollabTaskSubscription'
> {
  const {
    set,
    get,
    writeCachePrefix,
    noteFailure,
    optimisticPatch,
    settleDetailWrite,
    settingsFor
  } = deps

  return {
    createActiveCollabSubtask: async (args, options) => {
      const prefix = writeCachePrefix(options)
      const temp = buildOptimisticSubtask(args)
      const rollback = optimisticPatch(get, set, (s) =>
        appendActiveCollabSubtaskInCaches(s, args.taskId, temp, prefix)
      )
      const result = await activeCollabCreateSubtask(args, settingsFor(options))
      if (!result.ok) {
        rollback()
        noteFailure(set, get, result)
        return result
      }
      settleDetailWrite(set, args.taskId, prefix, result.value, (s, row) =>
        reconcileCreatedSubtaskInCaches(s, args.taskId, temp.id, row, prefix)
      )
      return result
    },

    updateActiveCollabSubtask: async (args, options) => {
      const prefix = writeCachePrefix(options)
      const rollback = optimisticPatch(get, set, (s) =>
        editActiveCollabSubtaskInCaches(s, args.taskId, args.subtaskId, args.update, prefix)
      )
      const result = await activeCollabUpdateSubtask(args, settingsFor(options))
      if (!result.ok) {
        rollback()
        noteFailure(set, get, result)
        return result
      }
      settleDetailWrite(set, args.taskId, prefix, result.value, (s, row) =>
        replaceActiveCollabSubtaskInCaches(s, args.taskId, row, prefix)
      )
      return result
    },

    setActiveCollabSubtaskCompletion: async (args, options) => {
      const prefix = writeCachePrefix(options)
      const rollback = optimisticPatch(get, set, (s) =>
        setActiveCollabSubtaskCompletionInCaches(
          s,
          args.taskId,
          args.subtaskId,
          args.isCompleted,
          prefix
        )
      )
      const transport = args.isCompleted ? activeCollabCompleteSubtask : activeCollabReopenSubtask
      const result = await transport({ subtaskId: args.subtaskId }, settingsFor(options))
      if (!result.ok) {
        rollback()
        noteFailure(set, get, result)
        return result
      }
      settleDetailWrite(set, args.taskId, prefix, result.value, (s, row) =>
        replaceActiveCollabSubtaskInCaches(s, args.taskId, row, prefix)
      )
      return result
    },

    updateActiveCollabComment: async (args, options) => {
      const prefix = writeCachePrefix(options)
      const rollback = optimisticPatch(get, set, (s) =>
        editActiveCollabCommentBodyInCaches(s, args.taskId, args.commentId, args.bodyHtml, prefix)
      )
      const result = await activeCollabUpdateComment(
        { commentId: args.commentId, bodyHtml: args.bodyHtml },
        settingsFor(options)
      )
      if (!result.ok) {
        rollback()
        noteFailure(set, get, result)
        return result
      }
      settleDetailWrite(set, args.taskId, prefix, result.value, (s, row) =>
        replaceActiveCollabCommentInCaches(s, args.taskId, row, prefix)
      )
      return result
    },

    deleteActiveCollabComment: async (args, options) => {
      const prefix = writeCachePrefix(options)
      const rollback = optimisticPatch(get, set, (s) =>
        removeActiveCollabCommentInCaches(s, args.taskId, args.commentId, prefix)
      )
      const result = await activeCollabDeleteComment(
        { commentId: args.commentId },
        settingsFor(options)
      )
      if (!result.ok) {
        rollback()
        noteFailure(set, get, result)
        return result
      }
      set({ activeCollabLastError: null, activeCollabLastFailureKind: null })
      return result
    },

    setActiveCollabTaskSubscription: async (args, options) => {
      const prefix = writeCachePrefix(options)
      const rollback = optimisticPatch(get, set, (s) =>
        toggleActiveCollabSubscriberInCaches(s, args.taskId, args.userId, args.subscribed, prefix)
      )
      const result = await activeCollabSetTaskSubscription(args, settingsFor(options))
      if (!result.ok) {
        rollback()
        noteFailure(set, get, result)
        return result
      }
      set({ activeCollabLastError: null, activeCollabLastFailureKind: null })
      return result
    }
  }
}
