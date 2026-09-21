import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { Repo } from '../../../../shared/types'
import type { RepoIcon } from '../../../../shared/repo-icon'
import { DEFAULT_REPO_BADGE_COLOR } from '../../../../shared/constants'
import { normalizeRepoBadgeColor } from '../../../../shared/repo-badge-color'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { RepoIconGlyph, getRepoLucideIconOptions } from '../repo/repo-icon'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../../shared/execution-host'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '@/store'
import { findSiteForProject } from '../right-sidebar/site-for-project'
import type { SiteSummary } from '../../../../shared/site-types'
import { RepositoryIconColorSection } from './RepositoryIconColorSection'
import { RepositoryIconTabs } from './RepositoryIconTabs'
import { resolveRepositoryUpstreamLive } from './repository-icon-github'
import { translate } from '@/i18n/i18n'

const NO_SITES: SiteSummary[] = []

export function RepositoryIconPicker({
  repo,
  updateRepo
}: {
  repo: Repo
  updateRepo: (repoId: string, updates: Partial<Repo>) => void
}): React.JSX.Element {
  const [resetting, setResetting] = useState(false)
  const mountedRef = useMountedRef()
  // Why: resolve this repo's upstream/avatar on the host that owns it, not the
  // focused runtime.
  const selectedHost = parseExecutionHostId(getRepoExecutionHostId(repo))
  const activeRuntimeEnvironmentId =
    selectedHost?.kind === 'runtime' ? selectedHost.environmentId : null
  const selectedLucideName = repo.repoIcon?.type === 'lucide' ? repo.repoIcon.name : null
  const selectedEmoji = repo.repoIcon?.type === 'emoji' ? repo.repoIcon.emoji : ''
  const selectedBadgeColor = normalizeRepoBadgeColor(repo.badgeColor) ?? DEFAULT_REPO_BADGE_COLOR
  const initialTab =
    repo.repoIcon?.type === 'emoji'
      ? 'emoji'
      : repo.repoIcon?.type === 'lucide'
        ? 'icon'
        : repo.repoIcon?.type === 'image' && repo.repoIcon.source === 'favicon'
          ? 'favicon'
          : 'icon'
  const runtimeTarget = useMemo(
    () => getActiveRuntimeTarget({ activeRuntimeEnvironmentId }),
    [activeRuntimeEnvironmentId]
  )

  const sites = useAppStore((s) => s.sites ?? NO_SITES)
  const fetchSites = useAppStore((s) => s.fetchSites)
  // Why: settings can open before the right sidebar ever fetched sites; one
  // refresh keeps the Favicon tab's live-domain prefill from staying empty.
  useEffect(() => {
    void fetchSites()
  }, [fetchSites])
  const defaultFaviconDomain = useMemo(() => {
    const summary = findSiteForProject(sites, repo.path)
    if (!summary) {
      return ''
    }
    const environmentName =
      summary.resolvedEnvironment.environment ?? summary.site.activeEnvironment
    return summary.site.environments[environmentName]?.liveDomain ?? ''
  }, [sites, repo.path])

  const currentIconLabel = useMemo(() => {
    if (repo.repoIcon?.type === 'image') {
      if (repo.repoIcon.source === 'github') {
        return 'GitHub avatar'
      }
      return repo.repoIcon.label ?? 'Custom image'
    }
    if (repo.repoIcon?.type === 'emoji') {
      return `${repo.repoIcon.emoji} emoji`
    }
    if (repo.repoIcon?.type === 'lucide') {
      const label =
        getRepoLucideIconOptions().find((option) => option.name === selectedLucideName)?.label ??
        'Folder'
      return `${label} icon with repo color`
    }
    return 'Default'
  }, [repo.repoIcon, selectedLucideName])

  const setIcon = (repoIcon: RepoIcon | null) => updateRepo(repo.id, { repoIcon })
  const setBadgeColor = (badgeColor: string) => updateRepo(repo.id, { badgeColor })

  const resolveUpstreamLive = useCallback(
    () => resolveRepositoryUpstreamLive(runtimeTarget, repo),
    [runtimeTarget, repo]
  )

  const handleResetToDefault = () => {
    setResetting(true)
    updateRepo(repo.id, { repoIcon: null })
    setResetting(false)
  }

  const upstreamResolvedRef = useRef<string | null>(null)
  useEffect(() => {
    // Why: `undefined` upstream is unresolved, and the fork indicator needs it.
    if (repo.upstream !== undefined || upstreamResolvedRef.current === repo.id) {
      return
    }
    upstreamResolvedRef.current = repo.id
    let cancelled = false
    // Why an async wrapper: the resolver can throw synchronously (no gh bridge), which a
    // trailing .catch() on the call would never see.
    void (async () => {
      try {
        const upstream = await resolveUpstreamLive()
        if (!cancelled && mountedRef.current) {
          updateRepo(repo.id, { upstream: upstream ?? null })
        }
      } catch {
        // Best-effort: an unresolved upstream only costs the fork indicator.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [repo.id, repo.upstream, resolveUpstreamLive, updateRepo, mountedRef])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <RepoIconGlyph
          repoIcon={repo.repoIcon}
          color={selectedBadgeColor}
          className="size-10 shrink-0 rounded-md border border-border/70 bg-muted/30"
          iconClassName="size-5"
        />
        <div className="min-w-0 flex-1">
          <Label className="text-sm font-semibold">
            {translate('auto.components.settings.RepositoryIconPicker.4e2a14f967', 'Repo Icon')}
          </Label>
          <div className="mt-1 truncate text-xs text-muted-foreground">{currentIconLabel}</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={resetting}
          onClick={handleResetToDefault}
        >
          <RotateCcw className="size-3.5" />
          {translate('auto.components.settings.RepositoryIconPicker.549d126081', 'Reset')}
        </Button>
      </div>

      <RepositoryIconColorSection badgeColor={repo.badgeColor} onBadgeColorChange={setBadgeColor} />

      <RepositoryIconTabs
        initialTab={initialTab}
        selectedLucideName={selectedLucideName}
        selectedEmoji={selectedEmoji}
        currentIcon={repo.repoIcon}
        defaultFaviconDomain={defaultFaviconDomain}
        onSetIcon={setIcon}
      />
    </div>
  )
}
