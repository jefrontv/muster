// Run controls for a site: action buttons that sit next to the step toggles they execute, plus
// the shared output surface (status, progress, log). Split so the owner can place the Import
// button under the import steps and the Deploy button under the deploy steps — one console state
// still backs both.

import { CircleStop, DownloadCloud, Loader2, UploadCloud } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef } from 'react'
import type { SiteRunGroup, SiteSummary } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import { SiteRunLogLines } from './SiteRunLogLines'
import { useSiteRun } from './use-site-run'

export type SiteRunConsoleState = {
  summary: SiteSummary
  run: ReturnType<typeof useSiteRun>['run']
  lines: ReturnType<typeof useSiteRun>['lines']
  progress: ReturnType<typeof useSiteRun>['progress']
  starting: boolean
  error: string | null
  running: boolean
  requestRun: (group: SiteRunGroup) => Promise<void>
  cancel: () => Promise<void>
}

export function useSiteRunConsole(summary: SiteSummary): SiteRunConsoleState {
  const { run, lines, progress, starting, error, start, cancel } = useSiteRun(summary.site.id)
  const confirm = useConfirmationDialog()
  const running = run?.status === 'running'

  const requestRun = async (group: SiteRunGroup): Promise<void> => {
    const target = summary.resolvedEnvironment.environment
    // The branch guard: an unmatched branch must never silently deploy to production.
    if (summary.resolvedEnvironment.requiresConfirmation) {
      const accepted = await confirm({
        title: translate('auto.components.sites.SiteRunConsole.confirmTitle', 'Confirm target'),
        description: translate(
          'auto.components.sites.SiteRunConsole.confirmBody',
          'Branch {{branch}} does not match an environment. This run would target {{environment}}. Continue?',
          { branch: summary.branch ?? '—', environment: target ?? '—' }
        ),
        confirmLabel: translate('auto.components.sites.SiteRunConsole.confirmRun', 'Run anyway'),
        confirmVariant: 'destructive'
      })
      if (!accepted) {
        return
      }
    }
    await start(group, target ?? undefined)
  }

  return { summary, run, lines, progress, starting, error, running, requestRun, cancel }
}

const GROUP_CHROME: Record<
  SiteRunGroup,
  { icon: typeof DownloadCloud; label: () => string; count: (summary: SiteSummary) => number }
> = {
  import: {
    icon: DownloadCloud,
    label: () => translate('auto.components.sites.SiteRunConsole.import', 'Import'),
    count: (summary) => summary.importSelectedCount
  },
  deploy: {
    icon: UploadCloud,
    label: () => translate('auto.components.sites.SiteRunConsole.deploy', 'Deploy'),
    count: (summary) => summary.deploySelectedCount
  }
}

/** The run button for one step group; place it directly under that group's toggles. */
export function SiteRunActionButton({
  console: consoleState,
  group
}: {
  console: SiteRunConsoleState
  group: SiteRunGroup
}): React.JSX.Element {
  const { summary, running, starting, requestRun } = consoleState
  const chrome = GROUP_CHROME[group]
  const count = chrome.count(summary)
  const Icon = chrome.icon
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={running || starting || count === 0}
      onClick={() => void requestRun(group)}
    >
      <Icon className="size-3.5" />
      {chrome.label()}
      <Badge variant="secondary">{count}</Badge>
    </Button>
  )
}

/** Status, progress, and log for the active run. Renders nothing while idle with no history. */
export function SiteRunOutput({
  console: consoleState
}: {
  console: SiteRunConsoleState
}): React.JSX.Element | null {
  const { run, lines, progress, starting, error, running, cancel } = consoleState
  const logRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [lines.length])

  const selectedCount =
    run?.group === 'deploy'
      ? consoleState.summary.deploySelectedCount
      : consoleState.summary.importSelectedCount

  if (!run && !starting && !error && !progress && lines.length === 0) {
    return null
  }

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void cancel()}>
            <CircleStop className="size-3.5" />
            {translate('auto.components.sites.SiteRunConsole.cancel', 'Cancel')}
          </Button>
        ) : null}
        {starting || running ? <Loader2 className="size-4 animate-spin" /> : null}
        {run ? (
          <span className="text-xs text-muted-foreground">
            {run.group} · {run.environment} · {run.status}
            {selectedCount > 0 ? ` · ${selectedCount}` : ''}
          </span>
        ) : null}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {progress ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate">{progress.stage}</span>
            {progress.percent === null ? null : <span>{progress.percent}%</span>}
          </div>
          <Progress value={progress.percent ?? 0} />
        </div>
      ) : null}

      {lines.length > 0 ? (
        <div
          ref={logRef}
          className="max-h-64 overflow-y-auto scrollbar-sleek rounded-md bg-muted/40 p-3 font-mono text-xs"
        >
          <SiteRunLogLines lines={lines} />
        </div>
      ) : null}
    </section>
  )
}
