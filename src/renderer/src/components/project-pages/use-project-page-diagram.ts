// Loads a diagram page, saves edits after a short pause, and reloads when someone else changes it.
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import type { AutosaveState } from './project-pages-autosave'

const SAVE_DELAY_MS = 700

export type DiagramContent = { xml: string; outline: string }

export function useProjectPageDiagram(
  scopeKey: string,
  meta: ProjectPageMeta,
  onSaveState: (state: AutosaveState) => void
) {
  /** XML to load into the editor; a new object means "replace the canvas". */
  const [loaded, setLoaded] = useState<{ xml: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const revision = useRef(meta.revision)
  const pending = useRef<(() => DiagramContent) | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const busy = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageId = meta.id

  const reload = useCallback(async () => {
    const result = await window.api.projectPages.diagram(scopeKey, pageId)
    if (!result.ok) {
      setError(result.message)
      return
    }
    revision.current = result.value.page.revision
    setError(null)
    setLoaded({ xml: result.value.xml })
  }, [scopeKey, pageId])

  /** Runs saves and renames one at a time so each sends the revision the last one produced. */
  const enqueue = useCallback((task: () => Promise<void>) => {
    busy.current = true
    queue.current = queue.current.then(task).finally(() => {
      busy.current = false
    })
    return queue.current
  }, [])

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const take = pending.current
    if (!take) {
      return queue.current
    }
    pending.current = null
    return enqueue(async () => {
      const content = take()
      onSaveState('saving')
      const result = await window.api.projectPages.saveDiagram(scopeKey, pageId, {
        baseRevision: revision.current,
        ...content
      })
      if (result.ok) {
        revision.current = result.value.page.revision
        onSaveState(pending.current ? 'pending' : 'saved')
      } else if (result.code === 'conflict') {
        onSaveState('conflict')
        toast.error('This diagram changed elsewhere, so it was reloaded.')
        await reload()
      } else {
        onSaveState('error')
        toast.error(result.message)
      }
    })
  }, [enqueue, onSaveState, reload, scopeKey, pageId])

  const schedule = useCallback(
    (snapshot: () => DiagramContent) => {
      pending.current = snapshot
      onSaveState('pending')
      if (timer.current) {
        clearTimeout(timer.current)
      }
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS)
    },
    [flush, onSaveState]
  )

  const rename = useCallback(
    (title: string) =>
      enqueue(async () => {
        const result = await window.api.projectPages.update(scopeKey, pageId, {
          baseRevision: revision.current,
          title
        })
        if (result.ok) {
          revision.current = result.value.meta.revision
        } else {
          toast.error(result.message)
        }
      }),
    [enqueue, scopeKey, pageId]
  )

  useEffect(() => {
    void reload()
  }, [reload])

  // Someone else (an agent, another window) saved: take their version when nothing local is waiting.
  useEffect(() => {
    if (meta.revision > revision.current && !pending.current && !busy.current) {
      void reload()
    }
  }, [meta.revision, reload])

  useEffect(() => () => void flush(), [flush])

  return { loaded, error, schedule, flush, rename }
}
