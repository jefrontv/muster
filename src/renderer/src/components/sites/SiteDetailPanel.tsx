import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import type React from 'react'
import type { SiteEnvironment, SiteSecretKind, SiteSummary } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { useAppStore } from '@/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SiteEnvironmentSection } from './SiteEnvironmentSection'
import { SiteRunConsole } from './SiteRunConsole'
import { SiteRunHistory } from './SiteRunHistory'

type SiteDetailPanelProps = {
  summary: SiteSummary
}

const getLocalFields = createLocalizedCatalog(() => [
  {
    key: 'localDomain' as const,
    label: translate('auto.components.sites.SiteDetailPanel.localDomain', 'Local domain'),
    placeholder: translate('auto.components.sites.SiteDetailPanel.localDomainHint', 'acme.local')
  },
  {
    key: 'localWpRoot' as const,
    label: translate('auto.components.sites.SiteDetailPanel.localWpRoot', 'WordPress subpath'),
    placeholder: translate('auto.components.sites.SiteDetailPanel.localWpRootHint', 'app/public')
  },
  {
    key: 'dbUser' as const,
    label: translate('auto.components.sites.SiteDetailPanel.dbUser', 'Local DB user'),
    placeholder: translate('auto.components.sites.SiteDetailPanel.dbUserHint', 'root')
  },
  {
    key: 'dbSocket' as const,
    label: translate('auto.components.sites.SiteDetailPanel.dbSocket', 'Local DB socket'),
    placeholder: translate(
      'auto.components.sites.SiteDetailPanel.dbSocketHint',
      '/…/mysql/mysqld.sock'
    )
  }
])

export function SiteDetailPanel({ summary }: SiteDetailPanelProps): React.JSX.Element {
  const updateSite = useAppStore((state) => state.updateSite)
  const setSiteSecret = useAppStore((state) => state.setSiteSecret)
  const upsertSiteEnvironment = useAppStore((state) => state.upsertSiteEnvironment)
  const removeSiteEnvironment = useAppStore((state) => state.removeSiteEnvironment)

  const { site, resolvedEnvironment, branch } = summary
  const environmentNames = Object.keys(site.environments)
  const activeName = resolvedEnvironment.environment ?? environmentNames[0] ?? ''
  const activeEnvironment = site.environments[activeName]

  const patchEnvironment = (patch: Partial<SiteEnvironment>): void => {
    void upsertSiteEnvironment(site.id, activeName, patch)
  }
  const setSecret = (kind: SiteSecretKind, value: string): void => {
    void setSiteSecret(site.id, activeName, kind, value)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto scrollbar-sleek p-5">
      <header className="space-y-1">
        <h2 className="text-base font-semibold">{site.displayName}</h2>
        <p className="truncate font-mono text-xs text-muted-foreground">{site.path}</p>
        {!summary.pathExists ? (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3.5" />
            {translate(
              'auto.components.sites.SiteDetailPanel.missingCheckout',
              'This folder is not on disk. Reconnect the drive or update the path.'
            )}
          </p>
        ) : null}
      </header>

      <section className="space-y-3">
        <h3 className="text-xs font-medium text-muted-foreground">
          {translate('auto.components.sites.SiteDetailPanel.localSection', 'Local environment')}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {getLocalFields().map((field) => (
            <div key={field.key} className="space-y-1">
              <Label className="text-xs">{field.label}</Label>
              <Input
                value={site[field.key]}
                placeholder={field.placeholder}
                onChange={(event) => void updateSite(site.id, { [field.key]: event.target.value })}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-medium text-muted-foreground">
            {translate('auto.components.sites.SiteDetailPanel.environments', 'Environments')}
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              const name = `environment-${environmentNames.length + 1}`
              void upsertSiteEnvironment(site.id, name)
            }}
          >
            <Plus className="size-3.5" />
            {translate('auto.components.sites.SiteDetailPanel.addEnvironment', 'Add')}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {environmentNames.map((name) => (
            <Badge
              key={name}
              variant={name === activeName ? 'default' : 'secondary'}
              className="gap-1"
            >
              {name}
              {environmentNames.length > 1 ? (
                <button
                  type="button"
                  aria-label={translate(
                    'auto.components.sites.SiteDetailPanel.removeEnvironment',
                    'Remove environment'
                  )}
                  onClick={() => void removeSiteEnvironment(site.id, name)}
                >
                  <Trash2 className="size-3" />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          {branch
            ? translate(
                'auto.components.sites.SiteDetailPanel.branchResolution',
                'Branch {{branch}} targets {{environment}}.',
                { branch, environment: activeName || '—' }
              )
            : translate(
                'auto.components.sites.SiteDetailPanel.noBranch',
                'No git branch detected; runs will ask for confirmation.'
              )}
          {resolvedEnvironment.requiresConfirmation
            ? ` ${translate(
                'auto.components.sites.SiteDetailPanel.confirmationRequired',
                'The branch does not match an environment, so a run must be confirmed.'
              )}`
            : ''}
        </p>

        {activeEnvironment ? (
          <SiteEnvironmentSection
            summary={summary}
            environmentName={activeName}
            environment={activeEnvironment}
            onPatch={patchEnvironment}
            onSetSecret={setSecret}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {translate(
              'auto.components.sites.SiteDetailPanel.noEnvironments',
              'This site has no environments yet.'
            )}
          </p>
        )}
      </section>

      <SiteRunConsole summary={summary} />
      <SiteRunHistory siteId={site.id} />
    </div>
  )
}
