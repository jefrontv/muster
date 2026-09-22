// Loads one project's open tasks and its task lists, and keeps them current while the panel is up.
//
// One request, not a paged sweep of assigned tasks: `listProjectTasks` carries the task LIST NAMES
// the panel groups by, and assigned tasks do not. See tasks-panel-projection.ts.
//
// Who the connected user is comes from the store instead of a second call here, because the detail
// pane needs the same connection for its instance URL and mention rendering.
//
// Freshness has two halves. A quiet refresh leaves `loading` alone, so the list does not flash a
// spinner or empty itself while someone is reading it; the button-driven reload does set `loading`,
// because there a spinner is the answer to "did my click do anything". Polling is every 45 seconds
// rather than every couple of seconds: every tick is a round trip to the ActiveCollab instance, and
// a task list nobody else is editing changes on the order of minutes.
//
// A generation counter guards every await. Switching workspace or rebinding mid-fetch must not let
// a slow earlier response overwrite the newer answer, and both happen with one click.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActiveCollabProjectTasks } from '../../../../shared/activecollab-types'

const TASKS_POLL_MS = 45_000

export type TasksPanelTasksState = {
  project: ActiveCollabProjectTasks | null
  loading: boolean
  /** A sentence already describing the failure. Null when nothing went wrong. */
  error: string | null
  /** Refetch with a spinner. For the refresh button. */
  reload: () => void
  /** Refetch without touching `loading`. For polls, window focus and closing a task. */
  refreshQuietly: () => void
}

export function useTasksPanelTasks(
  projectId: number | null,
  /** False while a task detail covers the list, so the panel stops polling for rows nobody sees. */
  poll = true
): TasksPanelTasksState {
  const [project, setProject] = useState<ActiveCollabProjectTasks | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const [request, setRequest] = useState({ nonce: 0, quiet: false })

  const reload = useCallback(
    () => setRequest((previous) => ({ nonce: previous.nonce + 1, quiet: false })),
    []
  )
  const refreshQuietly = useCallback(
    () => setRequest((previous) => ({ nonce: previous.nonce + 1, quiet: true })),
    []
  )

  useEffect(() => {
    if (projectId === null) {
      setProject(null)
      return
    }
    const current = ++generation.current
    if (!request.quiet) {
      setLoading(true)
      setError(null)
    }

    const run = async (): Promise<void> => {
      const tasks = await window.api.activecollab.listProjectTasks({ projectId })
      if (current !== generation.current) {
        return
      }
      if (!tasks.ok) {
        setError(tasks.error)
        setLoading(false)
        return
      }
      setProject(tasks.value)
      setError(null)
      setLoading(false)
    }

    void run().catch((cause: unknown) => {
      if (current === generation.current) {
        setError(cause instanceof Error ? cause.message : 'Could not read this project’s tasks.')
        setLoading(false)
      }
    })
  }, [projectId, request])

  useEffect(() => {
    if (projectId === null || !poll) {
      return
    }
    const timer = window.setInterval(refreshQuietly, TASKS_POLL_MS)
    // Coming back to the window is the moment the list is most likely to be stale, and waiting out
    // the rest of the interval to find out is the one case where the delay is noticeable.
    window.addEventListener('focus', refreshQuietly)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshQuietly)
    }
  }, [projectId, poll, refreshQuietly])

  return { project, loading, error, reload, refreshQuietly }
}
