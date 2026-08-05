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

function notifyRunFinished(run: SiteRun | null, runId: string, status: string): void {
  if (!run) {
    return
  }
  void window.api.notifications.dispatch({
    source: 'site-run-complete',
    notificationId: `site-run:${runId}`,
    siteRun: {
      siteName: run.siteName,
      group: run.group,
      environment: run.environment,
      status
    }
  })
}

const IDLE: SiteRunState = { run: null, lines: [], progress: null, starting: false, error: null }

/**
 * Drives one site's run: subscribe first, then start, so no event is missed between the invoke
 * and the listener attaching. On mount it recovers any run already in flight from main, which is
 * what makes the console survive navigating away and back. Events for a run this hook did not
 * start (site page, right-sidebar panel, MCP) are attributed via `active()` and adopted when they
 * belong to this site, so every surface streams the same run.
 */
export function useSiteRun(siteId: string | null): SiteRunState & {
  start: (group: SiteRunGroup, environment?: string) => Promise<void>
  cancel: () => Promise<void>
} {
  const [state, setState] = useState<SiteRunState>(IDLE)
  const runIdRef = useRef<string | null>(null)
  // Mirrors state.run so the event listener can read it without resubscribing on every change.
  const runRef = useRef<SiteRun | null>(null)
  // Mirrors siteId for the same reason; the subscription must survive re-renders untouched.
  const siteIdRef = useRef(siteId)
  siteIdRef.current = siteId
  // Guards: one attribution probe at a time, and none while our own start() is still resolving
  // (its events arrive before runIdRef is set and must not be adopted as "external").
  const probingRef = useRef(false)
  const startingRef = useRef(false)

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
    // Attributes an event stream to this site. Events carry only a runId, so ownership is
    // resolved through `active()`; a stale or foreign runId simply finds no matching entry.
    const adoptExternalRun = (runId: string): void => {
      const targetSiteId = siteIdRef.current
      if (!targetSiteId || probingRef.current || startingRef.current) {
        return
      }
      probingRef.current = true
      void window.api.siteRuns.active().then((result) => {
        probingRef.current = false
        if (!result.ok || siteIdRef.current !== targetSiteId || startingRef.current) {
          return
        }
        const active = result.value.find(
          (entry) => entry.run.siteId === targetSiteId && entry.run.id === runId
        )
        if (!active) {
          return
        }
        runIdRef.current = active.run.id
        setState({ ...IDLE, run: active.run, progress: active.progress })
        void window.api.siteRuns
          .readLog({ siteId: targetSiteId, runId, lines: MAX_LOG_LINES })
          .then((page) => {
            if (page.ok && runIdRef.current === runId) {
              setState((previous) => ({ ...previous, lines: page.value.lines }))
            }
          })
      })
    }
    const unsubscribe = window.api.siteRuns.onEvent((event: SiteRunEvent) => {
      if (event.runId !== runIdRef.current) {
        adoptExternalRun(event.runId)
        return
      }
      if (event.type === 'status' && event.status !== 'running') {
        // Outside the state updater: React may invoke an updater twice, and this has a side
        // effect. A deploy runs for minutes so the user has almost certainly looked away;
        // notifications are renderer-initiated by design and every enabled/focus/cooldown gate
        // lives behind dispatch, so it is correct to fire unconditionally here.
        notifyRunFinished(runRef.current, event.runId, event.status)
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

  useEffect(() => {
    runRef.current = state.run
  }, [state.run])

  const start = useCallback(
    async (group: SiteRunGroup, environment?: string): Promise<void> => {
      if (!siteId) {
        return
      }
      startingRef.current = true
      setState({ ...IDLE, starting: true })
      try {
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
      } finally {
        startingRef.current = false
      }
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
