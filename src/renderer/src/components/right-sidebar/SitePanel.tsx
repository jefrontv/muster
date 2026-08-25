// Right-sidebar 'Site' tab: a compact, read-mostly view of the active project's site
// configuration with quick Import/Deploy actions. The full editing surface stays on the Sites
// page; this panel answers "what would a run do right now" without leaving the workspace.

import { ArrowUpRight } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SiteRun, SiteRunLogLine } from '../../../../shared/site-run-types'
import type { SiteRunGroup, SiteSummary } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useRepoById } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import { cn } from '@/lib/utils'
import { useSiteRun } from '@/components/sites/use-site-run'
import { RUN_STATUS_TONE } from '@/components/sites/site-run-history-format'
import { openSiteInSitesPage } from './site-panel-open-in-sites'
import {
  InfoRow,
  RunStatusDot,
  SectionCard,
  SectionHeading,
  formatRelativeTime
} from './site-panel-controls'
import { useSiteForActiveProject } from './use-site-for-active-project'
import { SitePanelEnvironmentSection } from './site-panel-environment-section'
import { SitePanelRunOutput } from './site-panel-run-output'
import { SitePanelWpCliSection } from './site-panel-wp-cli'

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
  const applySiteSummary = useAppStore((s) => s.applySiteSummary)
  // A step toggle already gets the fresh summary back from its own write; patching it in avoids
  // the full list refetch (one git spawn per configured site) that made the checkboxes feel stuck.
  const onStepsChanged = useCallback(
    (next: SiteSummary) => applySiteSummary(next),
    [applySiteSummary]
  )
  const confirm = useConfirmationDialog()
  const [recentRuns, setRecentRuns] = useState<SiteRun[]>([])
  // The newest running run this panel is NOT streaming in-process — an agent started it through
  // the muster-sites MCP server. Its on-disk log is tailed below so it reads like a button run.
  const [externalTail, setExternalTail] = useState<{
    runId: string
    lines: SiteRunLogLine[]
  } | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)
  const externalLogRef = useRef<HTMLDivElement | null>(null)
  const onRunSettledRef = useRef(onRunSettled)
  onRunSettledRef.current = onRunSettled

  const running = run?.status === 'running'
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
  // The panel's own streamed run id — its settle already notifies from use-site-run.
  const runIdSeenRef = useRef<string | null>(null)
  runIdSeenRef.current = run?.id ?? runIdSeenRef.current
  useEffect(() => {
    const tick = async (): Promise<void> => {
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
        // Agent-started runs settle in another process, so nothing else notifies for them. The
        // panel's own streamed run already notified from use-site-run; skip it by id.
        for (const id of before) {
          if (nowRunning.has(id) || id === runIdSeenRef.current) {
            continue
          }
          const settled = result.value.find((entry) => entry.id === id)
          if (settled && settled.status !== 'running') {
            void window.api.notifications.dispatch({
              source: 'site-run-complete',
              notificationId: `site-run:${settled.id}`,
              siteRun: {
                siteName: settled.siteName,
                group: settled.group,
                environment: settled.environment,
                status: settled.status
              }
            })
          }
        }
        onRunSettledRef.current()
      }
    }
    // The timer itself pauses while the document is hidden, rather than a visibility check inside
    // the tick: a timer that fires forever keeps waking an otherwise-idle renderer even when every
    // wakeup is a no-op. An immediate tick on reveal covers runs that settled while hidden.
    let interval: number | null = null
    const reconcile = (): void => {
      if (document.visibilityState === 'visible') {
        if (interval === null) {
          interval = window.setInterval(() => void tick(), 2_500)
          void tick()
        }
        return
      }
      if (interval !== null) {
        window.clearInterval(interval)
        interval = null
      }
    }
    reconcile()
    document.addEventListener('visibilitychange', reconcile)
    return () => {
      document.removeEventListener('visibilitychange', reconcile)
      if (interval !== null) {
        window.clearInterval(interval)
      }
    }
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

  const externalRunningId =
    recentRuns.find((entry) => entry.status === 'running' && entry.id !== run?.id)?.id ?? null
  useEffect(() => {
    if (externalRunningId === null) {
      setExternalTail(null)
      return
    }
    let cancelled = false
    let timer: number | null = null
    const read = async (): Promise<void> => {
      const result = await window.api.siteRuns.readLog({
        siteId: site.id,
        runId: externalRunningId,
        lines: SIDEBAR_LOG_TAIL
      })
      if (cancelled) {
        return
      }
      if (result.ok) {
        setExternalTail({ runId: externalRunningId, lines: result.value.lines })
      }
      // The recent-runs poll clears externalRunningId once the run settles; until then keep tailing.
      timer = window.setTimeout(() => void read(), 2_000)
    }
    void read()
    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [externalRunningId, site.id])

  // The tail is what says a multi-minute run is still alive; keep the newest line in view.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [lines.length])
  useEffect(() => {
    externalLogRef.current?.scrollTo({ top: externalLogRef.current.scrollHeight })
  }, [externalTail?.lines.length])

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

      <SectionCard>
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
      </SectionCard>

      <SectionCard>
        <SitePanelEnvironmentSection
          summary={summary}
          targetName={targetName ?? null}
          targetEnvironment={targetEnvironment}
          importReason={importReason}
          deployReason={deployReason}
          busy={running || starting}
          requestRun={(group) => void requestRun(group)}
          onStepsChanged={onStepsChanged}
        />
      </SectionCard>

      {noEnvironmentReason === null ? (
        <SectionCard>
          <SitePanelWpCliSection
            siteId={site.id}
            targetName={targetName ?? null}
            disabledReason={noEnvironmentReason}
          />
        </SectionCard>
      ) : null}

      {/* Output only: the Import/Deploy actions live with their step toggles above. The section
          disappears while idle so the panel carries no empty chrome. */}
      <SitePanelRunOutput
        run={run}
        running={running}
        starting={starting}
        error={error}
        progress={progress}
        tailLines={tailLines}
        externalTail={externalTail}
        recentRuns={recentRuns}
        logRef={logRef}
        externalLogRef={externalLogRef}
        onCancel={() => void cancel()}
      />

      {recentRuns.length > 0 ? (
        <SectionCard>
          <SectionHeading>
            {translate('auto.components.right.sidebar.SitePanel.recentRuns', 'Recent runs')}
          </SectionHeading>
          <ul className="space-y-1">
            {recentRuns.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <RunStatusDot status={entry.status} />
                  <span className="truncate">
                    {entry.group} · {entry.environment}
                  </span>
                  <span className={cn('shrink-0 text-[11px]', RUN_STATUS_TONE[entry.status])}>
                    {entry.status}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatRelativeTime(entry.startedAt)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
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
  const setRightSidebarOpen = useAppStore((s) => s.setRightSidebarOpen)

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
      onOpenInSites={() =>
        openSiteInSitesPage({
          siteId: summary.site.id,
          selectSite,
          openSitesPage,
          setRightSidebarOpen
        })
      }
      onRunSettled={() => void fetchSites()}
    />
  )
}

export default SitePanel
