// The open project's page list, kept current by change events from main.
import { useCallback, useEffect, useState } from 'react'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'

export type ProjectPagesTreeState = {
  pages: ProjectPageMeta[]
  loaded: boolean
  error: string | null
  reload: () => void
}

export function useProjectPagesTree(scopeKey: string | null): ProjectPagesTreeState {
  const [state, setState] = useState<
    Omit<ProjectPagesTreeState, 'reload'> & { scopeKey: string | null }
  >({
    scopeKey: null,
    pages: [],
    loaded: false,
    error: null
  })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!scopeKey) {
      return undefined
    }
    let disposed = false
    const load = async (): Promise<void> => {
      const result = await window.api.projectPages.list(scopeKey)
      if (disposed) {
        return
      }
      setState(
        result.ok
          ? { scopeKey, pages: result.value.pages, loaded: true, error: null }
          : { scopeKey, pages: [], loaded: true, error: result.message }
      )
    }
    void load()
    const stop = window.api.projectPages.onChanged((change) => {
      if (change.scopeKey === scopeKey) {
        void load()
      }
    })
    return () => {
      disposed = true
      stop()
    }
  }, [scopeKey, tick])

  // A stale list from the previous project never shows under the new one.
  const current = state.scopeKey === scopeKey
  return {
    pages: current ? state.pages : [],
    loaded: current && state.loaded,
    error: current ? state.error : null,
    reload
  }
}
