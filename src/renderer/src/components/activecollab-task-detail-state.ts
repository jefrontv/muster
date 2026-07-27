/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: the selected task's detail comes from provider IPC, so a new task id must reset and refetch rather than derive during render. */
// Load state for one ActiveCollab task detail, read through the store slice so the pane shares the
// slice's cache, in-flight joining, and runtime-context guards instead of calling the client.

import { useCallback, useEffect, useRef, useState } from 'react'

import { useAppStore } from '@/store'
import type {
  ActiveCollabComment,
  ActiveCollabTask,
  ActiveCollabTaskDetail
} from '../../../shared/activecollab-types'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'

export type ActiveCollabTaskDetailStatus = 'idle' | 'loading' | 'loaded' | 'failed'

export type ActiveCollabTaskDetailState = {
  status: ActiveCollabTaskDetailStatus
  detail: ActiveCollabTaskDetail | null
  /**
   * The last read problem. `failed` means there is nothing to show; a failure alongside `loaded` is
   * a refetch that missed over a row already on screen, which stays readable.
   */
  failure: ActiveCollabFailure | null
}

export type ActiveCollabTaskDetailHandle = ActiveCollabTaskDetailState & {
  /** Force a fresh read, keeping the visible row until the answer lands. */
  reload: () => Promise<void>
  replaceTask: (task: ActiveCollabTask) => void
  appendComment: (comment: ActiveCollabComment) => void
}

const IDLE: ActiveCollabTaskDetailState = { status: 'idle', detail: null, failure: null }

export function useActiveCollabTaskDetail(
  projectId: number | null,
  taskId: number | null
): ActiveCollabTaskDetailHandle {
  const fetchTaskDetail = useAppStore((s) => s.fetchActiveCollabTaskDetail)
  const [state, setState] = useState<ActiveCollabTaskDetailState>(IDLE)
  // Bumped per read so a superseded answer — selection moved on, or a slower refetch — is dropped.
  const requestRef = useRef(0)

  const read = useCallback(
    async (force: boolean): Promise<void> => {
      if (projectId === null || taskId === null) {
        return
      }
      const requestId = (requestRef.current += 1)
      const result = await fetchTaskDetail({ projectId, taskId }, { force })
      if (requestId !== requestRef.current) {
        return
      }
      setState((prev) => {
        if (result.ok) {
          return { status: 'loaded', detail: result.value, failure: null }
        }
        return prev.detail
          ? { status: 'loaded', detail: prev.detail, failure: result }
          : { status: 'failed', detail: null, failure: result }
      })
    },
    [fetchTaskDetail, projectId, taskId]
  )

  useEffect(() => {
    if (projectId === null || taskId === null) {
      requestRef.current += 1
      setState(IDLE)
      return
    }
    setState({ status: 'loading', detail: null, failure: null })
    void read(false)
  }, [projectId, taskId, read])

  const replaceTask = useCallback((task: ActiveCollabTask): void => {
    setState((prev) =>
      prev.detail && prev.detail.task.id === task.id
        ? { status: 'loaded', detail: { ...prev.detail, task }, failure: null }
        : prev
    )
  }, [])

  const appendComment = useCallback((comment: ActiveCollabComment): void => {
    setState((prev) => {
      if (!prev.detail || prev.detail.comments.some((row) => row.id === comment.id)) {
        return prev
      }
      const comments = [...prev.detail.comments, comment]
      return { status: 'loaded', detail: { ...prev.detail, comments }, failure: null }
    })
  }, [])

  const reload = useCallback(() => read(true), [read])

  return { ...state, reload, replaceTask, appendComment }
}
