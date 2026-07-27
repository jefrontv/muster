// The write half of the ActiveCollab task pane: one in-flight mutation at a time, routed through
// the store slice so every cache holding the task settles the same way the slice already defines.

import { useCallback, useRef, useState } from 'react'

import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '@/store'
import type { ActiveCollabComment, ActiveCollabTask } from '../../../shared/activecollab-types'
import type {
  ActiveCollabFailure,
  ActiveCollabResult
} from '../../../shared/activecollab-api-types'

export type ActiveCollabTaskWriteField = 'completion' | 'labels' | 'dueDate' | 'comment'

export type ActiveCollabTaskWrites = {
  /** Non-null while a write is in flight; the pane disables every control off this. */
  pending: ActiveCollabTaskWriteField | null
  failure: ActiveCollabFailure | null
  setCompleted: (completed: boolean) => Promise<void>
  /** Full replacement set — see `activecollab-task-label-set.ts`. */
  setLabelNames: (labelNames: string[]) => Promise<void>
  /** Epoch ms for the local calendar day, or an explicit null to clear the date. */
  setDueOn: (dueOn: number | null) => Promise<void>
  addComment: (bodyHtml: string) => Promise<void>
}

export type ActiveCollabTaskWriteTarget = {
  projectId: number | null
  taskId: number | null
  onTask: (task: ActiveCollabTask) => void
  onComment: (comment: ActiveCollabComment) => void
  reload: () => Promise<void>
}

export function useActiveCollabTaskWrites(
  target: ActiveCollabTaskWriteTarget
): ActiveCollabTaskWrites {
  const { projectId, taskId, onTask, onComment, reload } = target
  const updateTask = useAppStore((s) => s.updateActiveCollabTask)
  const completeTask = useAppStore((s) => s.completeActiveCollabTask)
  const reopenTask = useAppStore((s) => s.reopenActiveCollabTask)
  const postComment = useAppStore((s) => s.postActiveCollabComment)
  const mountedRef = useMountedRef()
  const [pending, setPending] = useState<ActiveCollabTaskWriteField | null>(null)
  const [failure, setFailure] = useState<ActiveCollabFailure | null>(null)
  // A ref, not `pending`: two clicks in one tick would both read a stale `pending` of null.
  const pendingRef = useRef<ActiveCollabTaskWriteField | null>(null)

  const runWrite = useCallback(
    async <T>(
      field: ActiveCollabTaskWriteField,
      call: (ids: { projectId: number; taskId: number }) => Promise<ActiveCollabResult<T | null>>,
      apply: (value: T) => void
    ): Promise<void> => {
      if (projectId === null || taskId === null || pendingRef.current !== null) {
        return
      }
      pendingRef.current = field
      setPending(field)
      setFailure(null)
      try {
        const result = await call({ projectId, taskId })
        if (!result.ok) {
          if (mountedRef.current) {
            // Surfaced beside the row, never instead of it — the task is still valid on screen.
            setFailure(result)
          }
          return
        }
        if (result.value === null) {
          // The write landed but the instance echoed no usable row: refetch, do not error.
          await reload()
          return
        }
        apply(result.value)
      } finally {
        pendingRef.current = null
        if (mountedRef.current) {
          setPending(null)
        }
      }
    },
    [mountedRef, projectId, reload, taskId]
  )

  const setCompleted = useCallback(
    (completed: boolean) =>
      runWrite(
        'completion',
        (ids) =>
          completed ? completeTask({ taskId: ids.taskId }) : reopenTask({ taskId: ids.taskId }),
        onTask
      ),
    [completeTask, onTask, reopenTask, runWrite]
  )

  const setLabelNames = useCallback(
    (labelNames: string[]) =>
      runWrite('labels', (ids) => updateTask({ ...ids, update: { labelNames } }), onTask),
    [onTask, runWrite, updateTask]
  )

  const setDueOn = useCallback(
    (dueOn: number | null) =>
      // `dueOn` is always present in the update, so clearing sends an explicit null rather than
      // omitting the key, which would leave the server's date untouched.
      runWrite('dueDate', (ids) => updateTask({ ...ids, update: { dueOn } }), onTask),
    [onTask, runWrite, updateTask]
  )

  const addComment = useCallback(
    (bodyHtml: string) =>
      runWrite('comment', (ids) => postComment({ taskId: ids.taskId, bodyHtml }), onComment),
    [onComment, postComment, runWrite]
  )

  return { pending, failure, setCompleted, setLabelNames, setDueOn, addComment }
}
