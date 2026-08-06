import { AlertTriangle, ChevronDown, ChevronRight, FileText, Loader2 } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SiteRun, SiteRunLogPage } from '../../../../shared/site-run-types'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { openSiteRunLog } from './open-site-run-log'
import { RUN_STATUS_BADGE, RUN_STATUS_TONE, runDuration } from './site-run-history-format'

/** The stored log can be long; a tail is what the browser shows, the file keeps everything. */
const LOG_TAIL_LINES = 2_000

type SiteRunHistoryEntryProps = {
  run: SiteRun
  expanded: boolean
  onToggle: (runId: string) => void
}

export function SiteRunHistoryEntry({
  run,
  expanded,
  onToggle
}: SiteRunHistoryEntryProps): React.JSX.Element {
  const [page, setPage] = useState<SiteRunLogPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])

  // A run that is still RUNNING keeps refreshing its tail while expanded, so a run started by an
  // agent through the MCP server reads exactly like one started from the buttons. Settled runs
  // load once — their log cannot change.
  const running = run.status === 'running'
  useEffect(() => {
    if (!expanded || (page && !running)) {
      return
    }
    let cancelled = false
    let timer: number | null = null
    const read = async (): Promise<void> => {
      if (!page) {
        setLoading(true)
      }
      const result = await window.api.siteRuns.readLog({
        siteId: run.siteId,
        runId: run.id,
        lines: LOG_TAIL_LINES
      })
      if (cancelled) {
        return
      }
      setLoading(false)
      if (result.ok) {
        setPage(result.value)
      } else {
        setError(result.error)
      }
      // The freshest verdict is the meta that rode back with the tail: stop as soon as the run
      // settles on disk, even while the surrounding list still says running.
      const settled =
        result.ok && result.value.run !== null && result.value.run.status !== 'running'
      if (running && !settled) {
        timer = window.setTimeout(() => void read(), 2_000)
      }
    }
    void read()
    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
    // `page` is deliberately not a dependency: each poll writes it, and re-running the effect per
    // write would double the timers. `running` restarting the effect is the desired stop signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, running, run.id, run.siteId])

  const jumpToFirstError = useCallback(() => {
    const index = page?.firstErrorIndex ?? -1
    lineRefs.current[index]?.scrollIntoView({ block: 'center' })
  }, [page])

  const firstErrorIndex = page?.firstErrorIndex ?? -1

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/50"
        aria-expanded={expanded}
        onClick={() => onToggle(run.id)}
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <Badge variant={RUN_STATUS_BADGE[run.status]}>{run.status}</Badge>
        <span className="text-xs text-muted-foreground">{run.group}</span>
        <span className="truncate text-xs font-medium">{run.environment}</span>
        {run.branch ? (
          <span className="truncate font-mono text-xs text-muted-foreground">{run.branch}</span>
        ) : null}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {new Date(run.startedAt).toLocaleString()}
        </span>
        <span className={cn('shrink-0 text-xs tabular-nums', RUN_STATUS_TONE[run.status])}>
          {durationLabel(run)}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-2 px-2 pb-3">
          {run.error ? <p className="text-xs text-destructive">{run.error}</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {page ? (
            <>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={firstErrorIndex < 0}
                  onClick={jumpToFirstError}
                >
                  <AlertTriangle className="size-3.5" />
                  {firstErrorIndex < 0
                    ? translate(
                        'auto.components.sites.SiteRunHistoryEntry.noErrors',
                        'No errors logged'
                      )
                    : translate(
                        'auto.components.sites.SiteRunHistoryEntry.jumpToFirstError',
                        'Jump to first error'
                      )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  disabled={!run.logPath}
                  onClick={() => void openSiteRunLog(run)}
                >
                  <FileText className="size-3.5" />
                  {translate(
                    'auto.components.sites.SiteRunHistoryEntry.openInEditor',
                    'Open full log'
                  )}
                </Button>
                {page.truncatedEarlier > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {translate(
                      'auto.components.sites.SiteRunHistoryEntry.truncated',
                      '{{count}} earlier lines not shown',
                      { count: page.truncatedEarlier }
                    )}
                  </span>
                ) : null}
              </div>
              {page.lines.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.sites.SiteRunHistoryEntry.emptyLog',
                    'This run recorded no output.'
                  )}
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto scrollbar-sleek rounded-md bg-muted/40 p-2 font-mono text-xs">
                  {page.lines.map((line, index) => (
                    <div
                      key={`${line.at}-${index}`}
                      ref={(element) => {
                        lineRefs.current[index] = element
                      }}
                      data-run-log-line={index}
                      data-run-log-level={line.level}
                      className={cn(
                        'whitespace-pre-wrap break-words',
                        line.level === 'error' && 'text-destructive',
                        line.level === 'status' && 'font-medium',
                        index === firstErrorIndex && 'ring-1 ring-destructive/40'
                      )}
                    >
                      {line.text}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/** Numbers come from runDuration; the wording is localized here so a locale can reorder units. */
function durationLabel(run: SiteRun): string {
  const duration = runDuration(run)
  if (duration === null) {
    return translate('auto.components.sites.SiteRunHistoryEntry.stillRunning', 'running…')
  }
  if (duration.hours > 0) {
    return translate(
      'auto.components.sites.SiteRunHistoryEntry.durationHoursMinutes',
      '{{hours}}h {{minutes}}m',
      { hours: duration.hours, minutes: duration.minutes }
    )
  }
  if (duration.minutes > 0) {
    return translate(
      'auto.components.sites.SiteRunHistoryEntry.durationMinutesSeconds',
      '{{minutes}}m {{seconds}}s',
      { minutes: duration.minutes, seconds: duration.seconds }
    )
  }
  return translate('auto.components.sites.SiteRunHistoryEntry.durationSeconds', '{{seconds}}s', {
    seconds: duration.seconds
  })
}
