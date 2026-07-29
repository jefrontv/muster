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
  /**
   * `loading` is the FIRST read of a task and nothing else — it is what the pane draws a skeleton
   * for. A task this pane has already shown goes straight back to `loaded` from {@link seen} while
   * its refresh runs, and a refetch over a visible task stays `loaded` throughout.
   */
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

/**
 * Bounded, because the pane outlives every selection made through it. Insertion order is recency, so
 * the oldest entry goes when the map is full.
 */
const MAX_SEEN_DETAILS = 24

export function useActiveCollabTaskDetail(
  projectId: number | null,
  taskId: number | null
): ActiveCollabTaskDetailHandle {
  const fetchTaskDetail = useAppStore((s) => s.fetchActiveCollabTaskDetail)
  const markActiveCollabTaskRead = useAppStore((s) => s.markActiveCollabTaskRead)
  const [state, setState] = useState<ActiveCollabTaskDetailState>(IDLE)
  // Bumped per read so a superseded answer — selection moved on, or a slower refetch — is dropped.
  const requestRef = useRef(0)
  // Every task this pane has rendered, so switching back to one is instant instead of a skeleton
  // over content the user was reading a moment ago.
  const seenRef = useRef(new Map<string, ActiveCollabTaskDetail>())

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
    const seen = seenRef.current.get(`${projectId}:${taskId}`)
    setState(
      seen
        ? { status: 'loaded', detail: seen, failure: null }
        : { status: 'loading', detail: null, failure: null }
    )
    void read(false)
  }, [projectId, taskId, read])

  // Opening a task IS reading it, so the badge clears here rather than when the list is opened —
  // a list is not a read. Fired on the id, not on the loaded detail, so a task whose fetch fails
  // still stops nagging: the user looked, which is what the count was tracking.
  useEffect(() => {
    if (taskId !== null) {
      // Called optionally because this pane is mounted against partial store stand-ins in several
      // suites: clearing a badge is a nicety, and a missing action must not take the whole task
      // pane down on render. The real store always registers it.
      void markActiveCollabTaskRead?.(taskId)
    }
  }, [taskId, markActiveCollabTaskRead])

  // After commit rather than inside the updaters above: an updater can run twice, and this is the
  // one place every settled detail — first read, refetch, write echo — passes through.
  useEffect(() => {
    const detail = state.detail
    if (!detail) {
      return
    }
    const seen = seenRef.current
    const key = `${detail.task.projectId}:${detail.task.id}`
    seen.delete(key)
    seen.set(key, detail)
    if (seen.size > MAX_SEEN_DETAILS) {
      const oldest = seen.keys().next()
      if (!oldest.done) {
        seen.delete(oldest.value)
      }
    }
  }, [state.detail])

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
