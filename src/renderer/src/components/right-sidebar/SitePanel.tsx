// Right-sidebar 'Site' tab: a compact, read-mostly view of the active project's site
// configuration with quick Import/Deploy actions. The full editing surface stays on the Sites
// page; this panel answers "what would a run do right now" without leaving the workspace.

import { ArrowUpRight, CircleStop, DownloadCloud, Loader2, UploadCloud } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SiteRun } from '../../../../shared/site-run-types'
import type { SiteRunGroup, SiteSummary } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useRepoById } from '@/store/selectors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import { cn } from '@/lib/utils'
import { useSiteRun } from '@/components/sites/use-site-run'
import { RUN_STATUS_BADGE, RUN_STATUS_TONE } from '@/components/sites/site-run-history-format'
import {
  InfoRow,
  QuickActionButton,
  SectionHeading,
  formatRelativeTime
} from './site-panel-controls'
import { useSiteForActiveProject } from './use-site-for-active-project'
import { SiteStepToggles } from './site-panel-step-toggles'

/** The sidebar shows a tail, not the console: enough to see the run is alive and where it died. */
const SIDEBAR_LOG_TAIL = 200
const RECENT_RUNS_LIMIT = 5

export function SitePanelContent({
  summary,
  onOpenInSites,
  onRunSettled
}: {
  summary: SiteSummary
  onOpenInSites: () => void
  /** A settled run can change step counts and branch resolution; the owner refetches summaries. */
  onRunSettled: () => void
}): React.JSX.Element {
  const { site, branch, resolvedEnvironment } = summary
  const { run, lines, progress, starting, error, start, cancel } = useSiteRun(site.id)
  const confirm = useConfirmationDialog()
  const [recentRuns, setRecentRuns] = useState<SiteRun[]>([])
  const logRef = useRef<HTMLDivElement | null>(null)
  const onRunSettledRef = useRef(onRunSettled)
  onRunSettledRef.current = onRunSettled

  const running = run?.status === 'running'
  const environmentNames = Object.keys(site.environments)
  const targetName = resolvedEnvironment.environment
  const targetEnvironment = targetName ? (site.environments[targetName] ?? null) : null

  const loadRecentRuns = useCallback(async (): Promise<void> => {
    const result = await window.api.siteRuns.list({ siteId: site.id, limit: RECENT_RUNS_LIMIT })
    if (result.ok) {
      setRecentRuns(result.value)
    }
  }, [site.id])

  useEffect(() => {
    void loadRecentRuns()
  }, [loadRecentRuns])

  // Why poll: runs started OUTSIDE this process — the muster-sites MCP server is its own
  // Electron instance — share only the on-disk run log with the GUI, so no event ever arrives
  // here for them. A visible-panel poll over ≤5 meta.json files is the cheapest honest signal,
  // and it works where a file watcher cannot (remote runtimes, and the in-process @parcel/watcher
  // crash history, issue #7547). Summary refetch fires on running↔terminal transitions so step
  // counts and branch resolution stay current when an external run settles.
  const externallyRunningRef = useRef(new Set<string>())
  useEffect(() => {
    const tick = async (): Promise<void> => {
      if (document.visibilityState !== 'visible') {
        return
      }
      const result = await window.api.siteRuns.list({ siteId: site.id, limit: RECENT_RUNS_LIMIT })
      if (!result.ok) {
        return
      }
      setRecentRuns(result.value)
      const nowRunning = new Set(
        result.value.filter((entry) => entry.status === 'running').map((entry) => entry.id)
      )
      const before = externallyRunningRef.current
      const changed =
        [...nowRunning].some((id) => !before.has(id)) ||
        [...before].some((id) => !nowRunning.has(id))
      externallyRunningRef.current = nowRunning
      if (changed) {
        onRunSettledRef.current()
      }
    }
    const interval = window.setInterval(() => void tick(), 2_500)
    return () => window.clearInterval(interval)
  }, [site.id])

  // One effect per transition: history refreshes whenever the streamed run changes state, and a
  // terminal state additionally invalidates the summary (counts, branch resolution).
  const runId = run?.id ?? null
  const runStatus = run?.status ?? null
  useEffect(() => {
    if (runId === null || runStatus === null) {
      return
    }
    void loadRecentRuns()
    if (runStatus !== 'running') {
      onRunSettledRef.current()
    }
  }, [runId, runStatus, loadRecentRuns])

  // The tail is what says a multi-minute run is still alive; keep the newest line in view.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [lines.length])

  const requestRun = async (group: SiteRunGroup): Promise<void> => {
    // The branch guard: an unmatched branch must never silently deploy to production.
    if (resolvedEnvironment.requiresConfirmation) {
      const accepted = await confirm({
        title: translate('auto.components.right.sidebar.SitePanel.confirmTitle', 'Confirm target'),
        description: translate(
          'auto.components.right.sidebar.SitePanel.confirmBody',
          'Branch {{branch}} does not match an environment. This run would target {{environment}}. Continue?',
          { branch: branch ?? '—', environment: targetName ?? '—' }
        ),
        confirmLabel: translate('auto.components.right.sidebar.SitePanel.confirmRun', 'Run anyway'),
        confirmVariant: 'destructive'
      })
      if (!accepted) {
        return
      }
    }
    await start(group, targetName ?? undefined)
  }

  const noEnvironmentReason =
    targetEnvironment === null
      ? translate(
          'auto.components.right.sidebar.SitePanel.noEnvironmentReason',
          'No environment is configured for this site.'
        )
      : null
  const importReason =
    noEnvironmentReason ??
    (summary.importSelectedCount === 0
      ? translate(
          'auto.components.right.sidebar.SitePanel.noImportSteps',
          'No import steps are enabled for this environment.'
        )
      : null)
  const deployReason =
    noEnvironmentReason ??
    (summary.deploySelectedCount === 0
      ? translate(
          'auto.components.right.sidebar.SitePanel.noDeploySteps',
          'No deploy steps are enabled for this environment.'
        )
      : null)

  const tailLines = lines.length > SIDEBAR_LOG_TAIL ? lines.slice(-SIDEBAR_LOG_TAIL) : lines
  const openInSitesLabel = translate(
    'auto.components.right.sidebar.SitePanel.openInSites',
    'Open in Sites'
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scrollbar-sleek p-3">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h2 className="truncate text-sm font-semibold">{site.displayName}</h2>
          <p className="truncate font-mono text-[11px] text-muted-foreground" title={site.path}>
            {site.path}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={openInSitesLabel}
              onClick={onOpenInSites}
            >
              <ArrowUpRight className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {openInSitesLabel}
          </TooltipContent>
        </Tooltip>
      </header>

      <section className="space-y-1.5">
        <SectionHeading>
          {translate('auto.components.right.sidebar.SitePanel.localSection', 'Local')}
        </SectionHeading>
        <InfoRow
          label={translate('auto.components.right.sidebar.SitePanel.localDomain', 'Local domain')}
          value={site.localDomain || '—'}
          mono
        />
        <InfoRow
          label={translate(
            'auto.components.right.sidebar.SitePanel.localWpRoot',
            'WordPress subpath'
          )}
          value={site.localWpRoot || '—'}
          mono
        />
        <InfoRow
          label={translate('auto.components.right.sidebar.SitePanel.dbSocket', 'DB socket')}
          value={
            site.dbSocket.length > 0
              ? translate('auto.components.right.sidebar.SitePanel.dbSocketSet', 'Set')
              : '—'
          }
        />
      </section>

      <section className="space-y-1.5">
        <SectionHeading>
          {translate('auto.components.right.sidebar.SitePanel.environmentSection', 'Environment')}
        </SectionHeading>
        {environmentNames.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {environmentNames.map((name) => (
              <Badge key={name} variant={name === targetName ? 'default' : 'secondary'}>
                {name}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.right.sidebar.SitePanel.noEnvironments',
              'This site has no environments yet.'
            )}
          </p>
        )}
        {branch ? (
          <p className="text-xs text-muted-foreground">
            {resolvedEnvironment.requiresConfirmation
              ? translate(
                  'auto.components.right.sidebar.SitePanel.branchUnmatched',
                  'Branch {{branch}} matches no environment; runs must be confirmed.',
                  { branch }
                )
              : translate(
                  'auto.components.right.sidebar.SitePanel.branchResolution',
                  'Branch {{branch}} targets {{environment}}.',
                  { branch, environment: targetName ?? '—' }
                )}
          </p>
        ) : null}
        {targetEnvironment ? (
          <>
            <InfoRow
              label={translate('auto.components.right.sidebar.SitePanel.sshHost', 'SSH host')}
              value={targetEnvironment.hostname || '—'}
              mono
            />
            <InfoRow
              label={translate('auto.components.right.sidebar.SitePanel.sshUser', 'SSH user')}
              value={targetEnvironment.username || '—'}
              mono
            />
            <InfoRow
              label={translate('auto.components.right.sidebar.SitePanel.remoteRoot', 'Remote root')}
              value={targetEnvironment.rootPath || '—'}
              mono
            />
            <InfoRow
              label={translate('auto.components.right.sidebar.SitePanel.liveDomain', 'Live domain')}
              value={targetEnvironment.liveDomain || '—'}
              mono
            />
          </>
        ) : null}
        {targetName && targetEnvironment ? (
          <SiteStepToggles
            siteId={site.id}
            environmentName={targetName}
            environment={targetEnvironment}
            onChanged={() => onRunSettledRef.current()}
          />
        ) : (
          <>
            <InfoRow
              label={translate(
                'auto.components.right.sidebar.SitePanel.importSteps',
                'Import steps'
              )}
              value={String(summary.importSelectedCount)}
            />
            <InfoRow
              label={translate(
                'auto.components.right.sidebar.SitePanel.deploySteps',
                'Deploy steps'
              )}
              value={String(summary.deploySelectedCount)}
            />
          </>
        )}
      </section>

      <section className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <QuickActionButton
            icon={DownloadCloud}
            label={translate('auto.components.right.sidebar.SitePanel.import', 'Import')}
            count={summary.importSelectedCount}
            disabledReason={importReason}
            busy={running || starting}
            onRun={() => void requestRun('import')}
          />
          <QuickActionButton
            icon={UploadCloud}
            label={translate('auto.components.right.sidebar.SitePanel.deploy', 'Deploy')}
            count={summary.deploySelectedCount}
            disabledReason={deployReason}
            busy={running || starting}
            onRun={() => void requestRun('deploy')}
          />
          {running ? (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void cancel()}>
              <CircleStop className="size-3.5" />
              {translate('auto.components.right.sidebar.SitePanel.cancel', 'Cancel')}
            </Button>
          ) : null}
          {starting || running ? <Loader2 className="size-4 animate-spin" /> : null}
        </div>

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

        {tailLines.length > 0 ? (
          <div
            ref={logRef}
            className="max-h-48 overflow-y-auto scrollbar-sleek rounded-md bg-muted/40 p-2 font-mono text-[11px]"
          >
            {tailLines.map((line, index) => (
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
        ) : null}
      </section>

      {recentRuns.length > 0 ? (
        <section className="space-y-1.5 border-t border-border pt-3">
          <SectionHeading>
            {translate('auto.components.right.sidebar.SitePanel.recentRuns', 'Recent runs')}
          </SectionHeading>
          <ul className="space-y-1">
            {recentRuns.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Badge variant={RUN_STATUS_BADGE[entry.status]}>{entry.status}</Badge>
                  <span className="truncate">
                    {entry.group} · {entry.environment}
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatRelativeTime(entry.startedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function SitePanel(): React.JSX.Element {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const activeWorktree = useAppStore((s) =>
    activeWorktreeId ? (s.getKnownWorktreeById(activeWorktreeId) ?? null) : null
  )
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const summary = useSiteForActiveProject(activeRepo?.path ?? null)
  const selectSite = useAppStore((s) => s.selectSite)
  const openSitesPage = useAppStore((s) => s.openSitesPage)
  const fetchSites = useAppStore((s) => s.fetchSites)

  if (!summary) {
    // Only reachable in the gap between a workspace switch and the tab-visibility fallback.
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {translate(
          'auto.components.right.sidebar.SitePanel.noSite',
          'The active project is not linked to a site.'
        )}
      </p>
    )
  }

  return (
    <SitePanelContent
      summary={summary}
      onOpenInSites={() => {
        selectSite(summary.site.id)
        openSitesPage()
      }}
      onRunSettled={() => void fetchSites()}
    />
  )
}

export default SitePanel
