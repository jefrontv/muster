// Waiting comment drafts from the bots server, refetched on its change signal, plus each draft's task.
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BotsCommentDraft,
  BotsCommentDraftTask
} from '../../../../shared/bots-comment-draft-types'

export type BotsCommentDraftsState = {
  drafts: BotsCommentDraft[]
  tasks: Record<number, BotsCommentDraftTask>
  /** False until the first successful list read. */
  loaded: boolean
  /** The last list read failed; the previous drafts stay shown. */
  error: string | null
  refresh: () => Promise<void>
}

export function useBotsCommentDrafts(running: boolean): BotsCommentDraftsState {
  const [drafts, setDrafts] = useState<BotsCommentDraft[]>([])
  const [tasks, setTasks] = useState<Record<number, BotsCommentDraftTask>>({})
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const requestedTasks = useRef(new Set<number>())
  // Drops answers from an older request that lands after a newer one.
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    const mine = ++generation.current
    const result = await window.api.bots.listCommentDrafts()
    if (mine !== generation.current) {
      return
    }
    if (result.ok) {
      setDrafts(result.value)
      setLoaded(true)
      setError(null)
    } else {
      setError('message' in result ? result.message : null)
    }
  }, [])

  useEffect(() => {
    if (!running) {
      setDrafts([])
      setLoaded(false)
      return
    }
    void refresh()
    return window.api.bots.onCommentDraftsChanged(() => void refresh())
  }, [refresh, running])

  useEffect(() => {
    for (const draft of drafts) {
      if (requestedTasks.current.has(draft.taskId)) {
        continue
      }
      requestedTasks.current.add(draft.taskId)
      void window.api.bots
        .commentDraftTask({ projectId: draft.projectId, taskId: draft.taskId })
        .then((result) => {
          if (result.ok) {
            setTasks((current) => ({ ...current, [draft.taskId]: result.value }))
          } else {
            requestedTasks.current.delete(draft.taskId)
          }
        })
    }
  }, [drafts])

  return { drafts, tasks, loaded, error, refresh }
}
