// The Site panel's run-output section: cancel control, status line, progress, and the log tails
// for both the panel's own streamed run and an agent-started external run. Split from SitePanel
// for the file-size cap; state stays in the panel, this renders it.

import { CircleStop, Loader2 } from 'lucide-react'
import type React from 'react'
import type {
  SiteRun,
  SiteRunLogLine,
  SiteRunProgressEvent
} from '../../../../shared/site-run-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { RUN_STATUS_TONE } from '@/components/sites/site-run-history-format'

function LogTail({
  lines,
  logRef
}: {
  lines: SiteRunLogLine[]
  logRef: React.RefObject<HTMLDivElement | null>
}): React.JSX.Element {
  return (
    <div
      ref={logRef}
      className="max-h-48 overflow-y-auto scrollbar-sleek rounded-md bg-muted/40 p-2 font-mono text-[11px]"
    >
      {lines.map((line, index) => (
        <div
          key={`${line.at}-${index}`}
          className={cn(
            'whitespace-pre-wrap break-words',
            line.level === 'error' && 'text-destructive',
            line.level === 'status' && 'font-medium'
          )}
        >
          {line.text}
        </div>
      ))}
    </div>
  )
}

export function SitePanelRunOutput({
  run,
  running,
  starting,
  error,
  progress,
  tailLines,
  externalTail,
  recentRuns,
  logRef,
  externalLogRef,
  onCancel
}: {
  run: SiteRun | null
  running: boolean
  starting: boolean
  error: string | null
  progress: SiteRunProgressEvent | null
  tailLines: SiteRunLogLine[]
  externalTail: { runId: string; lines: SiteRunLogLine[] } | null
  recentRuns: SiteRun[]
  logRef: React.RefObject<HTMLDivElement | null>
  externalLogRef: React.RefObject<HTMLDivElement | null>
  onCancel: () => void
}): React.JSX.Element {
  return (
    <section
      className={cn(
        'space-y-2 border-t border-border pt-3',
        !run && !starting && !error && tailLines.length === 0 && externalTail === null && 'hidden'
      )}
    >
      {running || starting ? (
        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={onCancel}>
              <CircleStop className="size-3.5" />
              {translate('auto.components.right.sidebar.SitePanel.cancel', 'Cancel')}
            </Button>
          ) : null}
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : null}

      {run ? (
        <p className={cn('text-xs', RUN_STATUS_TONE[run.status])}>
          {run.group} · {run.environment} · {run.status}
          {progress && progress.percent !== null && running ? ` · ${progress.percent}%` : ''}
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {progress && running ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate">{progress.stage}</span>
            {progress.percent === null ? null : <span>{progress.percent}%</span>}
          </div>
          <Progress value={progress.percent ?? 0} />
        </div>
      ) : null}

      {externalTail !== null ? (
        <>
          <p className="text-xs text-muted-foreground">
            {(() => {
              const entry = recentRuns.find((candidate) => candidate.id === externalTail.runId)
              return entry
                ? `${entry.group} · ${entry.environment} · ${translate(
                    'auto.components.right.sidebar.SitePanel.externalRun',
                    'running (started by an agent)'
                  )}`
                : translate(
                    'auto.components.right.sidebar.SitePanel.externalRunBare',
                    'running (started by an agent)'
                  )
            })()}
          </p>
          {externalTail.lines.length > 0 ? (
            <LogTail lines={externalTail.lines} logRef={externalLogRef} />
          ) : null}
        </>
      ) : null}

      {tailLines.length > 0 ? <LogTail lines={tailLines} logRef={logRef} /> : null}
    </section>
  )
}
