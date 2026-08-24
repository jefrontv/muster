// The subtask/comment/watcher half of the task-pane writes. These reuse the pane's in-flight
// runners (`runWrite`/`runVoidWrite`) and its detail callbacks, so a write stays one mutation at a
// time no matter which half owns it.
import { useCallback } from 'react'

import { useAppStore } from '@/store'
import type {
  ActiveCollabComment,
  ActiveCollabSubtask,
  ActiveCollabSubtaskUpdate
} from '../../../shared/activecollab-types'
import type { ActiveCollabResult } from '../../../shared/activecollab-api-types'
import type { ActiveCollabTaskWriteField, ActiveCollabTaskWrites } from './activecollab-task-writes'

export type ActiveCollabTaskDetailWrites = Pick<
  ActiveCollabTaskWrites,
  | 'addSubtask'
  | 'editSubtask'
  | 'setSubtaskCompleted'
  | 'editComment'
  | 'removeComment'
  | 'setSubscribed'
>

type ActiveCollabRunWrite = <T>(
  field: ActiveCollabTaskWriteField,
  call: (ids: { projectId: number; taskId: number }) => Promise<ActiveCollabResult<T | null>>,
  apply: (value: T) => void
) => Promise<boolean>

type ActiveCollabRunVoidWrite = (
  field: ActiveCollabTaskWriteField,
  call: (ids: { projectId: number; taskId: number }) => Promise<ActiveCollabResult<null>>,
  apply: () => void
) => Promise<boolean>

export function useActiveCollabTaskDetailWrites(deps: {
  runWrite: ActiveCollabRunWrite
  runVoidWrite: ActiveCollabRunVoidWrite
  onSubtask: (subtask: ActiveCollabSubtask) => void
  onCommentReplaced: (comment: ActiveCollabComment) => void
  onCommentDropped: (commentId: number) => void
  onSubscription: (userId: number, subscribed: boolean) => void
}): ActiveCollabTaskDetailWrites {
  const { runWrite, runVoidWrite, onSubtask, onCommentReplaced, onCommentDropped, onSubscription } =
    deps
  const createSubtask = useAppStore((s) => s.createActiveCollabSubtask)
  const updateSubtask = useAppStore((s) => s.updateActiveCollabSubtask)
  const setSubtaskCompletion = useAppStore((s) => s.setActiveCollabSubtaskCompletion)
  const updateComment = useAppStore((s) => s.updateActiveCollabComment)
  const deleteComment = useAppStore((s) => s.deleteActiveCollabComment)
  const setSubscription = useAppStore((s) => s.setActiveCollabTaskSubscription)

  const addSubtask = useCallback(
    ({
      name,
      assigneeId,
      dueOn
    }: {
      name: string
      assigneeId?: number | null
      dueOn?: number | null
    }) =>
      runWrite('subtask', (ids) => createSubtask({ ...ids, name, assigneeId, dueOn }), onSubtask),
    [createSubtask, onSubtask, runWrite]
  )

  const editSubtask = useCallback(
    (subtaskId: number, update: ActiveCollabSubtaskUpdate) =>
      runWrite('subtask', (ids) => updateSubtask({ ...ids, subtaskId, update }), onSubtask),
    [onSubtask, runWrite, updateSubtask]
  )

  const setSubtaskCompleted = useCallback(
    (subtaskId: number, isCompleted: boolean) =>
      runWrite(
        'subtask',
        (ids) => setSubtaskCompletion({ taskId: ids.taskId, subtaskId, isCompleted }),
        onSubtask
      ),
    [onSubtask, runWrite, setSubtaskCompletion]
  )

  const editComment = useCallback(
    (commentId: number, bodyHtml: string) =>
      runWrite(
        'commentEdit',
        (ids) => updateComment({ taskId: ids.taskId, commentId, bodyHtml }),
        onCommentReplaced
      ),
    [onCommentReplaced, runWrite, updateComment]
  )

  const removeComment = useCallback(
    (commentId: number) =>
      runVoidWrite(
        'commentEdit',
        (ids) => deleteComment({ taskId: ids.taskId, commentId }),
        () => onCommentDropped(commentId)
      ),
    [deleteComment, onCommentDropped, runVoidWrite]
  )

  const setSubscribed = useCallback(
    (userId: number, subscribed: boolean) =>
      runVoidWrite(
        'watchers',
        (ids) => setSubscription({ taskId: ids.taskId, userId, subscribed }),
        () => onSubscription(userId, subscribed)
      ),
    [onSubscription, runVoidWrite, setSubscription]
  )

  return {
    addSubtask,
    editSubtask,
    setSubtaskCompleted,
    editComment,
    removeComment,
    setSubscribed
  }
}
