import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import type React from 'react'
import { Fragment, useState } from 'react'
import type { SiteEnvironment, SiteSecretKind, SiteSummary } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AddSiteEnvironmentDialog } from './AddSiteEnvironmentDialog'
import { SiteEnvironmentSection } from './SiteEnvironmentSection'
import { SiteSecretField } from './SiteSecretField'
import { SiteLocalStackControl } from './SiteLocalStackControl'
import { SiteRunActionButton, SiteRunOutput, useSiteRunConsole } from './SiteRunConsole'
import { SiteDbSnapshotsSection } from './SiteDbSnapshotsSection'
import { SiteRunHistory } from './SiteRunHistory'

type SiteDetailPanelProps = {
  summary: SiteSummary
}

const getLocalFields = createLocalizedCatalog(() => [
  {
    key: 'localDomain' as const,
    label: translate('auto.components.sites.SiteDetailPanel.localDomain', 'Local domain'),
    placeholder: translate('auto.components.sites.SiteDetailPanel.localDomainHint', 'site.local')
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
  // Why activeEnvironment before the first key: object order is insertion order, so a later-added
  // env would otherwise be edited while runs targeted the selected one.
  const runTargetName =
    resolvedEnvironment.environment ??
    (site.activeEnvironment && site.environments[site.activeEnvironment]
      ? site.activeEnvironment
      : (environmentNames[0] ?? ''))
  // Chip clicks are an explicit view/edit selection held locally — never written to
  // site.activeEnvironment, which would silently retarget runs (the exact bug this pane had).
  // Falls back to the run target when nothing is selected or the selected env was removed.
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const viewedName = selectedName && site.environments[selectedName] ? selectedName : runTargetName
  const viewedEnvironment = site.environments[viewedName]

  const patchEnvironment = (patch: Partial<SiteEnvironment>): void => {
    void upsertSiteEnvironment(site.id, viewedName, patch)
  }
  const setSecret = (kind: SiteSecretKind, value: string): void => {
    void setSiteSecret(site.id, viewedName, kind, value)
  }
  const runConsole = useSiteRunConsole(summary)

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
        <SiteLocalStackControl summary={summary} />
        <div className="grid gap-3 sm:grid-cols-2">
          {getLocalFields().map((field) => (
            <Fragment key={field.key}>
              <div className="space-y-1">
                <Label className="text-xs">{field.label}</Label>
                <Input
                  value={site[field.key]}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    void updateSite(site.id, { [field.key]: event.target.value })
                  }
                />
              </div>
              {/* The db secret is keyed per environment (an ocsites carry-over) but authenticates
                  the LOCAL database — see site-run-config.ts — so it belongs beside the local user
                  rather than in a password block under the remote settings. */}
              {field.key === 'dbUser' && viewedEnvironment ? (
                <SiteSecretField
                  key={`db-secret:${viewedName}`}
                  kind="db"
                  label={translate(
                    'auto.components.sites.SiteDetailPanel.dbPassword',
                    'Local DB password'
                  )}
                  isSet={summary.secrets[viewedName]?.db ?? false}
                  onSetSecret={setSecret}
                />
              ) : null}
            </Fragment>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-medium text-muted-foreground">
            {translate('auto.components.sites.SiteDetailPanel.environments', 'Environments')}
          </h3>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />
            {translate('auto.components.sites.SiteDetailPanel.addEnvironment', 'Add')}
          </Button>
        </div>

        {/* Same segmented control as the local stack picker above it, so the two pickers in this
            pane read as one design. Remove is a separate control acting on the selected
            environment rather than a trash icon inside every chip: a destructive button nested in
            the thing you click to switch is a mis-click waiting to happen. */}
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label={translate(
              'auto.components.sites.SiteDetailPanel.environments',
              'Environments'
            )}
            value={viewedName}
            // Radix clears the value when the active item is pressed again; one environment is
            // always being viewed, so that is a no-op rather than a third state.
            onValueChange={(next) => {
              if (next) {
                setSelectedName(next)
              }
            }}
          >
            {environmentNames.map((name) => (
              <ToggleGroupItem key={name} value={name} className="px-2.5 text-xs">
                {name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {environmentNames.length > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              aria-label={translate(
                'auto.components.sites.SiteDetailPanel.removeEnvironment',
                'Remove environment {{environment}}',
                { environment: viewedName }
              )}
              onClick={() => void removeSiteEnvironment(site.id, viewedName)}
            >
              <Trash2 />
              {translate('auto.components.sites.SiteDetailPanel.removeEnvironmentAction', 'Remove')}
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          {branch
            ? translate(
                'auto.components.sites.SiteDetailPanel.branchResolution',
                'Branch {{branch}} targets {{environment}}.',
                { branch, environment: runTargetName || '—' }
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

        {viewedName !== runTargetName ? (
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.sites.SiteDetailPanel.editingDivergence',
              'Editing {{environment}} — runs target {{target}}.',
              { environment: viewedName, target: runTargetName || '—' }
            )}
          </p>
        ) : null}

        {viewedEnvironment ? (
          <SiteEnvironmentSection
            summary={summary}
            environmentName={viewedName}
            environment={viewedEnvironment}
            onPatch={patchEnvironment}
            onSetSecret={setSecret}
            importAction={<SiteRunActionButton console={runConsole} group="import" />}
            deployAction={<SiteRunActionButton console={runConsole} group="deploy" />}
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

      <AddSiteEnvironmentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        siteId={site.id}
        environmentNames={environmentNames}
        defaultSource={viewedName}
        onCreated={setSelectedName}
      />

      <SiteRunOutput console={runConsole} />
      <SiteDbSnapshotsSection siteId={site.id} />
      <SiteRunHistory siteId={site.id} />
    </div>
  )
}
