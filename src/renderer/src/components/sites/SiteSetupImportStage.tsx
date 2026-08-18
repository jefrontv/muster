// The "Import from the server" stage of the guided setup.
//
// Import steps are off by default everywhere else — ocsites' `_empty_environment_payload`
// (deploy/config.py:52-68) defaults every toggle to False — but this is first-time setup, where
// pulling the whole site down IS the task. A partial default is what produced the live failure:
// `exportFiles` off meant no WordPress core ever landed, and search-replace then died on "This does
// not seem to be a WordPress installation". So all four start on here, and the list is always on
// screen rather than behind a "Choose steps" button: what is about to run has to be visible, and
// every one of them stays a checkbox the user can clear before pressing the button.
//
// The run is also watched here rather than handed off to the site page: this is a multi-minute
// operation over SSH, and "progress is on the site page" asked the user to leave the dialog that
// started it to find out whether it worked.
//
// The planner stays the authority on whether a run may start: every toggle change asks the parent to
// re-plan rather than re-deriving `ready`/`confirmable` locally.

import { Check, Database, Loader2 } from 'lucide-react'
import type React from 'react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { SiteSetupImportReadiness } from '../../../../shared/site-setup-flow-types'
import type { SiteRunStatus } from '../../../../shared/site-run-types'
import { SITE_IMPORT_TOGGLES, type SiteSummary } from '../../../../shared/site-types'
import { Checkbox } from '@/components/ui/checkbox'
import { getSiteSetupStrings } from './site-setup-strings'
import { getSiteToggleLabels } from './site-toggle-labels'

/** Enough to watch a whole import; the head is dropped so a chatty rsync cannot grow without bound. */
const MAX_LOG_LINES = 200

type ImportPhase = 'idle' | 'starting' | 'running' | 'finished'

const TERMINAL_STATUSES: readonly SiteRunStatus[] = ['succeeded', 'failed', 'cancelled', 'blocked']

export type SiteSetupImportStageHandle = {
  run: () => void
}

export const SiteSetupImportStage = forwardRef<
  SiteSetupImportStageHandle,
  {
    siteId: string
    readiness: SiteSetupImportReadiness
    /** Re-plans the whole setup: enabling a step can be what unblocks the run. */
    onStepsChanged: () => void
    /** Locks the pager's nav: leaving mid-import abandons a live SSH run with no way back to it. */
    onBusyChange?: (busy: boolean) => void
    /** Lets the host footer render Run instead of Done when there is something worth running. */
    onStartableChange?: (startable: boolean) => void
    /** Lets the host footer flip Run back to Done once the import succeeded. */
    onSettledChange?: (success: boolean) => void
  }
>(function SiteSetupImportStage(
  { siteId, readiness, onStepsChanged, onBusyChange, onStartableChange, onSettledChange },
  ref
): React.JSX.Element {
  const strings = getSiteSetupStrings()
  const toggleLabels = getSiteToggleLabels()
  const [summary, setSummary] = useState<SiteSummary | null>(null)
  const [phase, setPhase] = useState<ImportPhase>('idle')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<SiteRunStatus | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const [progress, setProgress] = useState<{ stage: string; percent: number | null } | null>(null)
  const runIdRef = useRef('')
  // Why buffer by run id: the subscription is live before `start()` resolves, so the first lines can
  // arrive before this component knows which run is its own. Adopt them once the id lands.
  const bufferRef = useRef(new Map<string, string[]>())
  const logRef = useRef<HTMLDivElement | null>(null)
  /** One shot: after this, an unticked box is the user's decision and must not be re-ticked. */
  const seededRef = useRef(false)

  useEffect(() => {
    return window.api.siteRuns.onEvent((event) => {
      if (event.type === 'log') {
        const next = [...(bufferRef.current.get(event.runId) ?? []), event.line.text].slice(
          -MAX_LOG_LINES
        )
        bufferRef.current.set(event.runId, next)
        if (event.runId === runIdRef.current) {
          setLines(next)
        }
        return
      }
      if (event.runId !== runIdRef.current) {
        return
      }
      if (event.type === 'progress') {
        setProgress({ stage: event.stage, percent: event.percent })
        return
      }
      setStatus(event.status)
      if (event.error !== undefined && event.error.length > 0) {
        setError(event.error)
      }
      if (TERMINAL_STATUSES.includes(event.status)) {
        setPhase('finished')
        setProgress(null)
        onSettledChange?.(event.status === 'succeeded')
        // The planner owns what the flow shows next, and a finished import changes its answer.
        onStepsChanged()
      }
    })
  }, [onStepsChanged, onSettledChange])

  // The log is what says a multi-minute import is still alive, so keep the newest line in view.
  useEffect(() => {
    const element = logRef.current
    if (element) {
      element.scrollTop = element.scrollHeight
    }
  }, [lines])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await window.api.sites.get(siteId)
      if (!cancelled && result.ok) {
        setSummary(result.value)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [siteId])

  const environment = summary?.site.environments[readiness.environment] ?? null

  // First-time setup runs the whole import, so the four steps arrive ticked instead of leaving the
  // user to work out which ones a working local site needs. Runs once — clearing a box afterwards
  // must stick.
  useEffect(() => {
    if (seededRef.current || !environment) {
      return
    }
    seededRef.current = true
    const missing = SITE_IMPORT_TOGGLES.filter((toggle) => !environment[toggle.key])
    if (missing.length === 0) {
      return
    }
    void (async () => {
      const patch = Object.fromEntries(missing.map((toggle) => [toggle.key, true]))
      const result = await window.api.sites.upsertEnvironment({
        siteId,
        name: readiness.environment,
        patch
      })
      if (result.ok) {
        setSummary(result.value)
        onStepsChanged()
      }
    })()
  }, [environment, siteId, readiness.environment, onStepsChanged])

  const toggleStep = async (key: string, enabled: boolean): Promise<void> => {
    setError('')
    const result = await window.api.sites.upsertEnvironment({
      siteId,
      name: readiness.environment,
      patch: { [key]: enabled }
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSummary(result.value)
    onStepsChanged()
  }

  const runImport = async (): Promise<void> => {
    setPhase('starting')
    setError('')
    setStatus(null)
    setLines([])
    setProgress(null)
    onSettledChange?.(false)
    const result = await window.api.siteRuns.start({
      siteId,
      group: 'import',
      ...(readiness.environment ? { environment: readiness.environment } : {})
    })
    if (!result.ok) {
      setError(result.error)
      setPhase('idle')
      return
    }
    runIdRef.current = result.value.id
    // Adopt anything the run emitted between start() dispatching and its id arriving here.
    setLines(bufferRef.current.get(result.value.id) ?? [])
    // A run that already finished this fast has no more events coming; trust its own status.
    if (TERMINAL_STATUSES.includes(result.value.status)) {
      setStatus(result.value.status)
      setPhase('finished')
      onSettledChange?.(result.value.status === 'succeeded')
      onStepsChanged()
      return
    }
    setPhase('running')
  }

  useImperativeHandle(ref, () => ({ run: () => void runImport() }))

  const enabledCount = summary?.importSelectedCount ?? readiness.enabledStepCount
  const startable = enabledCount > 0 && (readiness.ready || readiness.confirmable)
  const settled = phase === 'finished'
  const busy = phase === 'starting' || phase === 'running'

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  useEffect(() => {
    onStartableChange?.(startable && !settled)
  }, [startable, settled, onStartableChange])

  const statusMessages: Record<SiteRunStatus, string> = {
    running: strings.importRunning,
    succeeded: strings.importSucceeded,
    failed: strings.importFailed,
    cancelled: strings.importCancelled,
    blocked: strings.importBlocked
  }
  const headline = busy
    ? strings.importRunning
    : status
      ? statusMessages[status]
      : strings.importBody

  return (
    <div className="space-y-2 rounded-md border border-border px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium">{strings.importHeading}</p>
          <p className="text-xs text-muted-foreground">{headline}</p>
          {/* The count is the honest signal that there is anything worth running. */}
          {!settled && !busy && enabledCount > 0 ? (
            <p className="text-[11px] text-muted-foreground/70">
              {strings.importSteps.replace('{{count}}', String(enabledCount))}
            </p>
          ) : null}
          {/* No branch-mismatch warning here. It fired on the setup flow's normal case — a fresh
              clone on the default branch — and "Run anyway" already says the target is unconfirmed.
              The planner still reports `unmatched-branch`; only the extra line is gone. */}
        </div>
        {settled && status === 'succeeded' ? (
          <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
      </div>

      {/* Always on screen, never behind a disclosure: the run is destructive and what it is about
          to do to this checkout is the one thing the user has to be able to read first. */}
      {environment && !settled && !busy ? (
        <fieldset className="space-y-1.5 pl-6.5">
          <legend className="text-xs font-medium text-muted-foreground">
            {strings.importStepsLegend.replace('{{environment}}', readiness.environment)}
          </legend>
          {enabledCount === 0 ? (
            <p className="text-[11px] text-muted-foreground/70">{strings.importNoSteps}</p>
          ) : null}
          {SITE_IMPORT_TOGGLES.map((toggle) => (
            <label key={toggle.key} className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={environment[toggle.key]}
                onCheckedChange={(checked) => void toggleStep(toggle.key, checked === true)}
              />
              {toggleLabels[toggle.key] ?? toggle.label}
            </label>
          ))}
        </fieldset>
      ) : null}

      {busy ? (
        <p className="flex items-center gap-1.5 pl-6.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          {progress
            ? strings.importProgress
                .replace('{{stage}}', progress.stage)
                .replace('{{percent}}', progress.percent === null ? '—' : String(progress.percent))
            : strings.importRunning}
        </p>
      ) : null}

      {/* Why here rather than a handoff to the site page: this is the dialog that started the run,
          and an import over SSH takes minutes. Watching it should not cost the user their place. */}
      {lines.length > 0 ? (
        <div
          ref={logRef}
          role="log"
          aria-label={strings.importLogLabel}
          aria-live="polite"
          className="scrollbar-sleek ml-6.5 max-h-40 overflow-y-auto rounded border border-border/60 bg-muted/40 p-2"
        >
          {lines.map((line, index) => (
            <p
              // Status lines repeat verbatim while polling, so the index is the only stable key.
              key={`${index}-${line}`}
              className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground"
            >
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {error.length > 0 ? <p className="pl-6.5 text-xs text-destructive">{error}</p> : null}
    </div>
  )
})

export default SiteSetupImportStage
