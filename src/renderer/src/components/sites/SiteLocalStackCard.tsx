// Which local stack serves a site, whether it is up, and the controls to run it.
//
// One component for the sidebar (compact) and the Sites page, so the two never drift into separate
// designs of the same thing. Status comes from the stacks themselves through a shared poll; the
// record only says which stack the user chose.

import { CircleAlert, Loader2 } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { AgentLocalDaemonStatus } from '../../../../shared/site-stack-types'
import type { SiteLocalStack, SiteSummary } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAvailableSiteStacks } from '@/lib/use-available-site-stacks'
import {
  SiteLocalStackActions,
  SiteLocalStackActionsLoading,
  SiteLocalStackRename
} from './SiteLocalStackActions'
import { SiteLocalStackCompact } from './site-local-stack-compact'
import {
  SiteLocalStackDetails,
  SiteLocalStackDetailsLoading,
  SiteLocalStackField
} from './site-local-stack-details'
import { siteLocalStackLabel } from './site-local-stack-labels'
import { siteStackAutodetectPatch } from './site-stack-autodetect'
import { SiteStackStatusPill, siteStackPill } from './site-stack-status-pill'
import { useSiteStackActions } from './use-site-stack-actions'
import { useSiteStackStatus } from './use-site-stack-status'

function folderName(sitePath: string): string {
  // findLast, not filter().at(-1): a trailing slash leaves an empty final segment.
  return sitePath.split(/[/\\]/).findLast((segment) => segment.length > 0) ?? 'site'
}

export function SiteLocalStackCard({
  summary,
  compact = false
}: {
  summary: SiteSummary
  compact?: boolean
}): React.JSX.Element {
  const { site } = summary
  const updateSite = useAppStore((state) => state.updateSite)
  const available = useAvailableSiteStacks()
  const { detection, transition, refresh, setTransition } = useSiteStackStatus(site.id)
  const [daemon, setDaemon] = useState<AgentLocalDaemonStatus | null>(null)
  const [domain, setDomain] = useState('')
  const [renaming, setRenaming] = useState(false)

  const stack = site.localStack
  const managed = stack !== 'plain'
  const stackLabel = siteLocalStackLabel(stack)
  const confirmed = managed && detection?.stack === stack
  const needsSetup = managed && detection !== null && detection.stack !== stack
  const servedDomain = (confirmed ? detection?.domain : '') || site.localDomain
  const siteUrl = (confirmed && detection?.url) || (servedDomain ? `https://${servedDomain}` : '')
  const suggestedDomain =
    site.localDomain.trim() ||
    (stack === 'ddev' ? `${folderName(site.path)}.ddev.site` : `${folderName(site.path)}.test`)
  const dockerDown = confirmed && stack === 'ddev' && detection?.appRunning === false
  const actions = useSiteStackActions({
    siteId: site.id,
    stack,
    servedDomain,
    refresh,
    setTransition
  })
  const { pending, spinning, clearMessages } = actions
  const busy = pending !== ''

  useEffect(() => {
    clearMessages()
    setDomain('')
    setRenaming(false)
  }, [site.id, clearMessages])

  // The version gates the daemon-side import; an update worth one quiet line, not a surprise.
  useEffect(() => {
    if (stack !== 'agent-local' || compact) {
      setDaemon(null)
      return
    }
    let cancelled = false
    void (async () => {
      const answer = await window.api.siteStacks.agentLocalStatus?.()
      if (!cancelled && answer?.ok) {
        setDaemon(answer.value)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [stack, compact])

  // Adopt the detected stack on an unconfigured site and keep localDomain equal to the serving
  // domain (deploys and search-replace read it). The signature stops a double write mid-refresh.
  const appliedAutodetectRef = useRef('')
  useEffect(() => {
    if (!detection) {
      return
    }
    const patch = siteStackAutodetectPatch(
      { localStack: site.localStack, localDomain: site.localDomain, localWpRoot: site.localWpRoot },
      detection
    )
    if (!patch) {
      return
    }
    const signature = `${site.id}\0${patch.localStack ?? ''}\0${patch.localDomain ?? ''}\0${patch.localWpRoot ?? ''}`
    if (appliedAutodetectRef.current === signature) {
      return
    }
    appliedAutodetectRef.current = signature
    void updateSite(site.id, patch)
  }, [detection, site.id, site.localStack, site.localDomain, site.localWpRoot, updateSite])

  const setUp = async (): Promise<void> => {
    if (await actions.setUp((domain.trim() || suggestedDomain).trim())) {
      setDomain('')
    }
  }

  if (compact) {
    return (
      <SiteLocalStackCompact
        site={site}
        detection={detection}
        loading={managed && detection === null}
        pill={siteStackPill({ stack, detection, transition })}
        confirmed={confirmed}
        needsSetup={needsSetup}
        dockerDown={dockerDown}
        servedDomain={servedDomain}
        siteUrl={siteUrl}
        actions={actions}
        onSetUp={() => void setUp()}
      />
    )
  }

  const showProviderNote = confirmed && !dockerDown && Boolean(detection?.providerNote)
  const loading = managed && detection === null
  const providerLabel = translate(
    'auto.components.sites.SiteLocalStackCard.provider',
    'Local stack'
  )

  return (
    <section className="space-y-3" data-contextual-tour-target="sites-detail">
      {/* Same header shape as Environments below: heading left, its controls right. h-8 holds the
          row's height whether the buttons, their placeholders or neither are showing. */}
      <div className="flex h-8 items-center gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">
          {translate('auto.components.sites.SiteDetailPanel.localSection', 'Local environment')}
        </h3>
        {managed ? (
          <SiteStackStatusPill pill={siteStackPill({ stack, detection, transition })} />
        ) : null}
        <div className="ml-auto">
          {loading ? <SiteLocalStackActionsLoading /> : null}
          {confirmed ? (
            <SiteLocalStackActions
              sitePath={site.path}
              stack={stack}
              running={detection?.socketReady === true}
              dockerDown={dockerDown}
              servedDomain={servedDomain}
              actions={actions}
              refresh={refresh}
              onChangeDomain={() => setRenaming(true)}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SiteLocalStackField label={providerLabel}>
          {/* The picker fills the box itself; the wrapper only lends the label. */}
          <Select
            value={stack}
            disabled={busy}
            onValueChange={(next) =>
              void updateSite(site.id, { localStack: next as SiteLocalStack })
            }
          >
            <SelectTrigger
              aria-label={providerLabel}
              className="-mx-3 h-9 w-[calc(100%+1.5rem)] border-0 bg-transparent shadow-none dark:bg-transparent"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set<SiteLocalStack>(['plain', ...(available ?? []), stack])].map(
                (choice) => (
                  <SelectItem key={choice} value={choice}>
                    {siteLocalStackLabel(choice)}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </SiteLocalStackField>
        {loading ? <SiteLocalStackDetailsLoading /> : null}
        {confirmed ? (
          <SiteLocalStackDetails
            site={site}
            detection={detection}
            servedDomain={servedDomain}
            siteUrl={siteUrl}
          />
        ) : null}
      </div>

      {renaming && confirmed ? (
        <SiteLocalStackRename
          servedDomain={servedDomain}
          actions={actions}
          onClose={() => setRenaming(false)}
        />
      ) : null}

      {!managed ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.sites.SiteLocalStackCard.noneHint',
            'Muster doesn’t manage a local stack for this site.'
          )}
        </p>
      ) : null}

      {needsSetup ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.sites.SiteLocalStackCard.setupHint',
              '{{stack}} doesn’t serve this folder yet. Setting it up keeps the files where they are.'
            ).replace('{{stack}}', stackLabel)}
          </p>
          <div className="flex items-center gap-2">
            <Input
              className="min-w-0 flex-1"
              value={domain}
              placeholder={suggestedDomain}
              disabled={busy}
              aria-label={translate(
                'auto.components.sites.SiteLocalStackCard.domain',
                'Local domain'
              )}
              onChange={(event) => setDomain(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !busy) {
                  void setUp()
                }
              }}
            />
            <Button
              // Fixed width so the in-flight label cannot resize the row.
              className="w-44"
              disabled={busy}
              onClick={() => void setUp()}
            >
              {spinning && pending === 'setup' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              {pending === 'setup'
                ? translate('auto.components.sites.SiteLocalStackCard.settingUp', 'Setting up…')
                : translate(
                    'auto.components.sites.SiteLocalStackCard.setUpWith',
                    'Set up with {{stack}}'
                  ).replace('{{stack}}', stackLabel)}
            </Button>
          </div>
        </div>
      ) : null}

      {/* The record and the stacks disagreeing is the case worth surfacing: only the stacks know. */}
      {detection && detection.stack !== stack && detection.stack !== 'plain' ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.sites.SiteLocalStackCard.detected',
            '{{stack}} serves this folder.'
          ).replace('{{stack}}', siteLocalStackLabel(detection.stack))}{' '}
          <Button
            variant="link"
            className="h-auto p-0 text-xs"
            disabled={busy}
            // Adopting the stack also adopts its serving domain; the two travel together.
            onClick={() =>
              void updateSite(site.id, {
                localStack: detection.stack,
                ...(detection.domain.trim() && detection.domain !== site.localDomain
                  ? { localDomain: detection.domain.trim() }
                  : {})
              })
            }
          >
            {translate('auto.components.sites.SiteLocalStackCard.switchToIt', 'Switch to it')}
          </Button>
        </p>
      ) : null}

      {dockerDown ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>
            {detection?.providerNote ||
              translate(
                'auto.components.sites.SiteLocalStackCard.dockerDown',
                'Docker isn’t running.'
              )}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="w-28"
            disabled={busy}
            onClick={() => void actions.startOrStop('start')}
          >
            {spinning && pending === 'start' ? <Loader2 className="animate-spin" /> : null}
            {translate('auto.components.sites.SiteLocalStackCard.startDocker', 'Start Docker')}
          </Button>
        </div>
      ) : null}

      {/* empty:hidden so a section with no notes keeps no trailing gap. */}
      <div className="space-y-1 text-xs text-muted-foreground empty:hidden">
        {showProviderNote ? <p>{detection?.providerNote}</p> : null}

        {daemon && daemon.version.length > 0 ? (
          <p>
            {translate(
              'auto.components.sites.SiteLocalStackCard.agentLocalVersion',
              'Agent Local {{version}}'
            ).replace('{{version}}', daemon.version)}
            {daemon.updateAvailable && daemon.latest.length > 0
              ? ` · ${translate('auto.components.sites.SiteLocalStackCard.agentLocalUpdate', '{{latest}} available').replace('{{latest}}', daemon.latest)}`
              : ''}
            {!daemon.importRoutes
              ? ` · ${translate('auto.components.sites.SiteLocalStackCard.agentLocalOldForImport', 'imports use Muster’s own tools until 0.32.2')}`
              : ''}
          </p>
        ) : null}

        {actions.status.length > 0 ? <p>{actions.status}</p> : null}

        {/* Inline and persistent: these come from another process and need to be read and acted on. */}
        {actions.failure.length > 0 ? (
          <p className="flex items-start gap-1.5 text-destructive">
            <CircleAlert className="mt-px size-3 shrink-0" />
            <span className="break-words whitespace-pre-wrap">{actions.failure}</span>
          </p>
        ) : null}
      </div>
    </section>
  )
}

export default SiteLocalStackCard
