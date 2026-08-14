// The write half of the ActiveCollab task pane: one in-flight mutation at a time, routed through
// the store slice so every cache holding the task settles the same way the slice already defines.

import { useCallback, useRef, useState } from 'react'

import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '@/store'
import type { ActiveCollabComment, ActiveCollabTask } from '../../../shared/activecollab-types'
import type { ActiveCollabSchedule } from './activecollab-task-schedule'
import type {
  ActiveCollabFailure,
  ActiveCollabResult
} from '../../../shared/activecollab-api-types'
import { toggleActiveCollabLabelName } from './activecollab-task-label-set'

export type ActiveCollabTaskWriteField =
  | 'completion'
  | 'labels'
  | 'dueDate'
  | 'assignee'
  | 'visibility'
  | 'comment'

export type ActiveCollabTaskWrites = {
  /** Non-null while a write is in flight; the pane disables every control off this. */
  pending: ActiveCollabTaskWriteField | null
  failure: ActiveCollabFailure | null
  /**
   * Every write resolves TRUE only when it actually LANDED, including the refetch path where the
   * instance echoed no row but did store the change. False means it was refused or coalesced away,
   * and `failure` carries the reason. Callers that only fire and forget can ignore it.
   */
  setCompleted: (completed: boolean) => Promise<boolean>
  /**
   * Toggles ONE label. The full replacement set the API demands is built here from a forced-fresh
   * detail read, not from the caller's cached row: labels REPLACE wholesale, so a set built from a
   * row up to a cache-TTL old silently deletes any label a colleague added since (lost update).
   */
  toggleLabel: (labelName: string) => Promise<boolean>
  /**
   * The picker's Save/Clear: BOTH date fields travel every time — Save writes the range, Clear
   * sends explicit nulls. An omitted key would leave the server's value alone.
   */
  setSchedule: (schedule: ActiveCollabSchedule) => Promise<boolean>
  /** A user id, or an explicit null to unassign. */
  setAssigneeId: (assigneeId: number | null) => Promise<boolean>
  /** ActiveCollab's hidden-from-clients flag; false makes the task visible to client-role users. */
  setHiddenFromClients: (hidden: boolean) => Promise<boolean>
  /**
   * `attachmentCodes` are already-uploaded codes; the upload happens BEFORE this is called, so a
   * false here means the files reached the instance but the comment did not — see the composer,
   * which is the only thing that can say so.
   */
  addComment: (bodyHtml: string, attachmentCodes: string[]) => Promise<boolean>
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
  const fetchTaskDetail = useAppStore((s) => s.fetchActiveCollabTaskDetail)
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
    ): Promise<boolean> => {
      if (projectId === null || taskId === null || pendingRef.current !== null) {
        return false
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
          return false
        }
        if (result.value === null) {
          // The write landed but the instance echoed no usable row: refetch, do not error.
          await reload()
          return true
        }
        apply(result.value)
        return true
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

  const toggleLabel = useCallback(
    (labelName: string) =>
      runWrite(
        'labels',
        async (ids) => {
          // Shrinks the read-modify-write race from a cache TTL to milliseconds. The API offers
          // no precondition header, so a concurrent edit inside that window is accepted risk.
          const fresh = await fetchTaskDetail(ids, { force: true })
          if (!fresh.ok) {
            return fresh
          }
          const labelNames = toggleActiveCollabLabelName(fresh.value.task.labels, labelName)
          return updateTask({ ...ids, update: { labelNames } })
        },
        onTask
      ),
    [fetchTaskDetail, onTask, runWrite, updateTask]
  )

  const setSchedule = useCallback(
    ({ startOn, dueOn }: ActiveCollabSchedule) =>
      // Both keys are always present, so clearing sends explicit nulls rather than omitting the
      // keys, which would leave the server's dates untouched.
      runWrite('dueDate', (ids) => updateTask({ ...ids, update: { startOn, dueOn } }), onTask),
    [onTask, runWrite, updateTask]
  )

  const setAssigneeId = useCallback(
    (assigneeId: number | null) =>
      // Explicit null, never an omitted key: `ActiveCollabTaskUpdate` leaves absent fields alone,
      // so omitting `assigneeId` would make Unassign a silent no-op.
      runWrite('assignee', (ids) => updateTask({ ...ids, update: { assigneeId } }), onTask),
    [onTask, runWrite, updateTask]
  )

  const setHiddenFromClients = useCallback(
    (isHiddenFromClients: boolean) =>
      runWrite(
        'visibility',
        (ids) => updateTask({ ...ids, update: { isHiddenFromClients } }),
        onTask
      ),
    [onTask, runWrite, updateTask]
  )

  const addComment = useCallback(
    (bodyHtml: string, attachmentCodes: string[]) =>
      runWrite(
        'comment',
        (ids) =>
          // Absent, not empty: a comment with no attachments has to travel the exact shape it
          // always did, all the way down to the request body.
          postComment(
            attachmentCodes.length === 0
              ? { taskId: ids.taskId, bodyHtml }
              : { taskId: ids.taskId, bodyHtml, attachmentCodes }
          ),
        onComment
      ),
    [onComment, postComment, runWrite]
  )

  return {
    pending,
    failure,
    setCompleted,
    toggleLabel,
    setSchedule,
    setAssigneeId,
    setHiddenFromClients,
    addComment
  }
}
