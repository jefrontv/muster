// The sidebar's Local card: read the stack, run it, nothing else. Choosing or moving a stack lives on
// the Sites page; here the provider is a fact, not a control.

import { CircleAlert, ExternalLink, Loader2, Play, RotateCw, Square } from 'lucide-react'
import type React from 'react'
import type { LocalWpStackDetection } from '../../../../shared/site-stack-types'
import type { Site } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { InfoRow, SectionCard, SectionHeading } from '../right-sidebar/site-panel-controls'
import { siteLocalStackLabel } from './site-local-stack-labels'
import { SiteStackStatusPill, type SiteStackPill } from './site-stack-status-pill'
import type { useSiteStackActions } from './use-site-stack-actions'

function docrootLabel(docroot: string): string {
  const trimmed = docroot.replace(/^[/\\]+|[/\\]+$/g, '')
  return trimmed.length === 0 || trimmed === '.' ? '' : trimmed
}

/** The schema first (what a person looks for), the port after it; never a password. */
function databaseLabel(
  site: Pick<Site, 'localStack'>,
  detection: LocalWpStackDetection | null
): string {
  if (site.localStack === 'localwp') {
    return detection?.socketPath ? 'local · socket' : ''
  }
  const name = detection?.databaseName ?? ''
  const port = detection?.databasePort ? `:${detection.databasePort}` : ''
  return [name, port].filter(Boolean).join(' ')
}

const SKELETON = 'animate-pulse rounded bg-muted/60'

/** Rows a served site shows, held at their final height until detection answers. */
function LoadingRows(): React.JSX.Element {
  const labels = [
    translate('auto.components.sites.SiteLocalStackCard.site', 'Site'),
    translate('auto.components.sites.SiteLocalStackCard.php', 'PHP'),
    translate('auto.components.sites.SiteLocalStackCard.database', 'Database')
  ]
  return (
    <div aria-hidden className="space-y-1.5">
      {labels.map((label, index) => (
        <div key={label} className="flex items-center justify-between gap-3 text-xs">
          <span className="shrink-0 text-muted-foreground">{label}</span>
          <span className={cn('inline-block h-3', SKELETON, index === 0 ? 'w-32' : 'w-12')} />
        </div>
      ))}
      <div className="grid grid-cols-2 gap-4 pt-2.5">
        <span className={cn('h-8 rounded-md', SKELETON)} />
        <span className={cn('h-8 rounded-md', SKELETON)} />
      </div>
    </div>
  )
}

export function SiteLocalStackCompact({
  site,
  detection,
  loading,
  pill,
  confirmed,
  needsSetup,
  dockerDown,
  servedDomain,
  siteUrl,
  actions,
  onSetUp
}: {
  site: Site
  detection: LocalWpStackDetection | null
  /** A managed stack whose first detection has not answered yet. */
  loading: boolean
  pill: SiteStackPill
  confirmed: boolean
  needsSetup: boolean
  dockerDown: boolean
  servedDomain: string
  siteUrl: string
  actions: ReturnType<typeof useSiteStackActions>
  onSetUp: () => void
}): React.JSX.Element {
  const { pending, spinning } = actions
  const busy = pending !== ''
  const running = detection?.socketReady === true
  const stackLabel = siteLocalStackLabel(site.localStack)
  const docroot = docrootLabel(detection?.docroot ?? site.localWpRoot)
  const database = databaseLabel(site, detection)
  const php = detection?.phpVersion || site.phpVersion
  const spinnerFor = (...kinds: string[]): boolean => spinning && kinds.includes(pending)

  return (
    <SectionCard>
      <div className="flex h-5 items-center justify-between gap-2">
        <SectionHeading>
          {translate('auto.components.sites.SiteLocalStackCard.heading', 'Local')}
        </SectionHeading>
        <SiteStackStatusPill pill={pill} />
      </div>

      <InfoRow
        label={translate('auto.components.sites.SiteLocalStackCard.provider', 'Provider')}
        value={site.localStack === 'plain' ? '—' : stackLabel}
      />

      {loading ? (
        <LoadingRows />
      ) : confirmed ? (
        <>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="shrink-0 text-muted-foreground">
              {translate('auto.components.sites.SiteLocalStackCard.site', 'Site')}
            </span>
            {siteUrl ? (
              <button
                type="button"
                className="group flex min-w-0 items-center gap-1 font-mono hover:underline"
                title={siteUrl}
                onClick={() => void window.api.shell.openUrl(siteUrl)}
              >
                <span className="truncate">{servedDomain}</span>
                <ExternalLink className="size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              </button>
            ) : (
              <span>—</span>
            )}
          </div>
          {php ? (
            <InfoRow
              label={translate('auto.components.sites.SiteLocalStackCard.php', 'PHP')}
              value={php}
              mono
            />
          ) : null}
          {docroot ? (
            <InfoRow
              label={translate('auto.components.sites.SiteLocalStackCard.docroot', 'Docroot')}
              value={docroot}
              mono
            />
          ) : null}
          {database ? (
            <InfoRow
              label={translate('auto.components.sites.SiteLocalStackCard.database', 'Database')}
              value={database}
              mono
            />
          ) : null}

          {dockerDown ? (
            <p className="text-[11px] text-muted-foreground">
              {translate(
                'auto.components.sites.SiteLocalStackCard.dockerDownStart',
                'Docker isn’t running. Start brings it up first.'
              )}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-4 pt-2.5">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              disabled={busy}
              onClick={() => void actions.startOrStop(running ? 'stop' : 'start')}
            >
              {spinnerFor('start', 'stop') ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : running ? (
                <Square className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )}
              {running
                ? translate('auto.components.sites.SiteLocalStackCard.stop', 'Stop')
                : translate('auto.components.sites.SiteLocalStackCard.start', 'Start')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn('w-full gap-1.5', !running && 'opacity-50')}
              disabled={busy || !running}
              onClick={() => void actions.restart()}
            >
              {spinnerFor('restart') ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RotateCw className="size-3.5" />
              )}
              {translate('auto.components.sites.SiteLocalStackCard.restart', 'Restart')}
            </Button>
          </div>
        </>
      ) : needsSetup ? (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-xs text-muted-foreground">
            {translate(
              'auto.components.sites.SiteLocalStackCard.notServingShort',
              'Not set up yet'
            )}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="w-[92px] gap-1.5"
            disabled={busy}
            onClick={onSetUp}
          >
            {spinnerFor('setup') ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {translate('auto.components.sites.SiteLocalStackCard.setUp', 'Set up')}
          </Button>
        </div>
      ) : null}

      {/* Inline and persistent: these come from another process and need to be read and acted on. */}
      {actions.failure.length > 0 ? (
        <p className="flex items-start gap-1.5 text-[11px] text-destructive">
          <CircleAlert className="mt-px size-3 shrink-0" />
          <span className="break-words whitespace-pre-wrap">{actions.failure}</span>
        </p>
      ) : null}
    </SectionCard>
  )
}
