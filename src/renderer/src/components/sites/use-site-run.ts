import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  SiteRun,
  SiteRunEvent,
  SiteRunLogLine,
  SiteRunProgressEvent
} from '../../../../shared/site-run-types'
import type { SiteRunGroup } from '../../../../shared/site-types'

// The renderer keeps a bounded tail; the full log lives on disk and is read on demand. Without a
// cap a long import would grow the React tree until the panel janks.
const MAX_LOG_LINES = 2_000

export type SiteRunState = {
  run: SiteRun | null
  lines: SiteRunLogLine[]
  progress: SiteRunProgressEvent | null
  starting: boolean
  error: string | null
}

const IDLE: SiteRunState = { run: null, lines: [], progress: null, starting: false, error: null }

/**
 * Drives one site's run: subscribe first, then start, so no event is missed between the invoke
 * and the listener attaching. On mount it recovers any run already in flight from main, which is
 * what makes the console survive navigating away and back.
 */
export function useSiteRun(siteId: string | null): SiteRunState & {
  start: (group: SiteRunGroup, environment?: string) => Promise<void>
  cancel: () => Promise<void>
} {
  const [state, setState] = useState<SiteRunState>(IDLE)
  const runIdRef = useRef<string | null>(null)

  useEffect(() => {
    setState(IDLE)
    runIdRef.current = null
    if (!siteId) {
      return
    }
    let cancelled = false
    void window.api.siteRuns.active().then((result) => {
      if (cancelled || !result.ok) {
        return
      }
      const active = result.value.find((entry) => entry.run.siteId === siteId)
      if (!active) {
        return
      }
      runIdRef.current = active.run.id
      setState((previous) => ({ ...previous, run: active.run, progress: active.progress }))
      void window.api.siteRuns
        .readLog({ siteId, runId: active.run.id, lines: MAX_LOG_LINES })
        .then((page) => {
          if (!cancelled && page.ok) {
            setState((previous) => ({ ...previous, lines: page.value.lines }))
          }
        })
    })
    return () => {
      cancelled = true
    }
  }, [siteId])

  useEffect(() => {
    const unsubscribe = window.api.siteRuns.onEvent((event: SiteRunEvent) => {
      if (event.runId !== runIdRef.current) {
        return
      }
      setState((previous) => {
        if (event.type === 'log') {
          const lines = [...previous.lines, event.line]
          return {
            ...previous,
            lines: lines.length > MAX_LOG_LINES ? lines.slice(-MAX_LOG_LINES) : lines
          }
        }
        if (event.type === 'progress') {
          return { ...previous, progress: event }
        }
        return {
          ...previous,
          run: previous.run ? { ...previous.run, status: event.status } : previous.run,
          error: event.error ?? previous.error
        }
      })
    })
    return unsubscribe
  }, [])

  const start = useCallback(
    async (group: SiteRunGroup, environment?: string): Promise<void> => {
      if (!siteId) {
        return
      }
      setState({ ...IDLE, starting: true })
      const result = await window.api.siteRuns.start({
        siteId,
        group,
        ...(environment ? { environment } : {})
      })
      if (!result.ok) {
        setState({ ...IDLE, error: result.error })
        return
      }
      runIdRef.current = result.value.id
      setState({ ...IDLE, run: result.value })
    },
    [siteId]
  )

  const cancel = useCallback(async (): Promise<void> => {
    const runId = runIdRef.current
    if (runId) {
      await window.api.siteRuns.cancel(runId)
    }
  }, [])

  return { ...state, start, cancel }
}
