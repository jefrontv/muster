// Detail-level cache patchers: subtasks, comments and watchers live on the detail entry, not the
// page row, so their fan-out is narrower.
import type {
  ActiveCollabComment,
  ActiveCollabSubtask,
  ActiveCollabSubtaskUpdate,
  ActiveCollabTask
} from '../../../../shared/activecollab-types'
import { editTaskCaches } from './activecollab-task-patch'
import type { TaskCaches } from './activecollab-task-patch'

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

/** Swap an optimistic subtask (temp id) for the authoritative returned row, keeping counts. */
export function reconcileCreatedSubtaskInCaches(
  state: TaskCaches,
  taskId: number,
  tempId: number,
  subtask: ActiveCollabSubtask,
  cachePrefix: string | null
): Partial<TaskCaches> {
  return editTaskCaches(state, taskId, cachePrefix, {
    detail: (detail) => ({
      ...detail,
      subtasks: detail.subtasks.map((row) => (row.id === tempId ? subtask : row))
    })
  })
}

/** Move a task's subtask counts, leaving null alone: absent means the instance does not track it. */
function withSubtaskCounts(
  task: ActiveCollabTask,
  deltaOpen: number,
  deltaTotal: number
): ActiveCollabTask {
  return {
    ...task,
    openSubtaskCount: task.openSubtaskCount === null ? null : task.openSubtaskCount + deltaOpen,
    totalSubtaskCount: task.totalSubtaskCount === null ? null : task.totalSubtaskCount + deltaTotal
  }
}

/** Append a created subtask and advance both counts when the instance tracks them. */
export function appendActiveCollabSubtaskInCaches(
  state: TaskCaches,
  taskId: number,
  subtask: ActiveCollabSubtask,
  cachePrefix: string | null
): Partial<TaskCaches> {
  return editTaskCaches(state, taskId, cachePrefix, {
    detail: (detail) => ({
      ...detail,
      task: withSubtaskCounts(detail.task, 1, 1),
      subtasks: [...detail.subtasks, subtask]
    }),
    row: (task) => withSubtaskCounts(task, 1, 1)
  })
}

/** Apply a field-level update in place (optimistic), preserving fields the update omits. */
export function editActiveCollabSubtaskInCaches(
  state: TaskCaches,
  taskId: number,
  subtaskId: number,
  update: ActiveCollabSubtaskUpdate,
  cachePrefix: string | null
): Partial<TaskCaches> {
  return editTaskCaches(state, taskId, cachePrefix, {
    detail: (detail) => ({
      ...detail,
      subtasks: detail.subtasks.map((row) =>
        row.id === subtaskId
          ? {
              ...row,
              name: update.name ?? row.name,
              assigneeId: update.assigneeId !== undefined ? update.assigneeId : row.assigneeId,
              dueOn: update.dueOn !== undefined ? update.dueOn : row.dueOn
            }
          : row
      )
    })
  })
}

/** Replace one subtask in place for a name/assignee/dueOn edit; counts do not move. */
export function replaceActiveCollabSubtaskInCaches(
  state: TaskCaches,
  taskId: number,
  subtask: ActiveCollabSubtask,
  cachePrefix: string | null
): Partial<TaskCaches> {
  return editTaskCaches(state, taskId, cachePrefix, {
    detail: (detail) => ({
      ...detail,
      subtasks: detail.subtasks.map((row) => (row.id === subtask.id ? subtask : row))
    })
  })
}

/** Toggle one subtask's completion and move the open count by the real delta. */
export function setActiveCollabSubtaskCompletionInCaches(
  state: TaskCaches,
  taskId: number,
  subtaskId: number,
  isCompleted: boolean,
  cachePrefix: string | null
): Partial<TaskCaches> {
  // The page row carries only counts, not the subtask, so the delta is derived from the detail
  // (which edits first) and read by the row edit that follows it.
  let deltaOpen = 0
  return editTaskCaches(state, taskId, cachePrefix, {
    detail: (detail) => {
      const current = detail.subtasks.find((row) => row.id === subtaskId)
      deltaOpen = current && current.isCompleted !== isCompleted ? (isCompleted ? -1 : 1) : 0
      return {
        ...detail,
        task: withSubtaskCounts(detail.task, deltaOpen, 0),
        subtasks: detail.subtasks.map((row) =>
          row.id === subtaskId ? { ...row, isCompleted } : row
        )
      }
    },
    row: (task) => withSubtaskCounts(task, deltaOpen, 0)
  })
}

/** Edit only a comment's body in place (optimistic), preserving its other fields. */
export function editActiveCollabCommentBodyInCaches(
  state: TaskCaches,
  taskId: number,
  commentId: number,
  bodyHtml: string,
  cachePrefix: string | null
): Partial<TaskCaches> {
  return editTaskCaches(state, taskId, cachePrefix, {
    detail: (detail) => ({
      ...detail,
      comments: detail.comments.map((row) => (row.id === commentId ? { ...row, bodyHtml } : row))
    }),
    detailFetchedAt: 0
  })
}

/** Replace one comment's body in place; the thread is stale until the next detail read. */
export function replaceActiveCollabCommentInCaches(
  state: TaskCaches,
  taskId: number,
  comment: ActiveCollabComment,
  cachePrefix: string | null
): Partial<TaskCaches> {
  return editTaskCaches(state, taskId, cachePrefix, {
    detail: (detail) => ({
      ...detail,
      comments: detail.comments.map((row) => (row.id === comment.id ? comment : row))
    }),
    detailFetchedAt: 0
  })
}

/** Remove a deleted comment and keep the badge in step with the thread. */
export function removeActiveCollabCommentInCaches(
  state: TaskCaches,
  taskId: number,
  commentId: number,
  cachePrefix: string | null
): Partial<TaskCaches> {
  return editTaskCaches(state, taskId, cachePrefix, {
    detail: (detail) => ({
      ...detail,
      task: { ...detail.task, commentCount: detail.task.commentCount - 1 },
      comments: detail.comments.filter((row) => row.id !== commentId)
    }),
    detailFetchedAt: 0,
    row: (task) => ({ ...task, commentCount: task.commentCount - 1 })
  })
}

/** Add or remove one watcher in place; watchers never appear on a page row. */
export function toggleActiveCollabSubscriberInCaches(
  state: TaskCaches,
  taskId: number,
  userId: number,
  subscribed: boolean,
  cachePrefix: string | null
): Partial<TaskCaches> {
  return editTaskCaches(state, taskId, cachePrefix, {
    detail: (detail) => {
      const has = detail.subscriberIds.includes(userId)
      const subscriberIds = subscribed
        ? has
          ? detail.subscriberIds
          : [...detail.subscriberIds, userId]
        : detail.subscriberIds.filter((id) => id !== userId)
      return { ...detail, subscriberIds }
    }
  })
}
