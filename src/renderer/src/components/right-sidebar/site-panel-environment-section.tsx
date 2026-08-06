// The Site panel's Environment section: env chips, branch resolution, resolved-target info rows,
// and the step toggles with their embedded Import/Deploy quick actions.

import type React from 'react'
import type { SiteEnvironment, SiteRunGroup, SiteSummary } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { Badge } from '@/components/ui/badge'
import { InfoRow, SectionHeading, SiteRunQuickAction } from './site-panel-controls'
import { SiteStepToggles } from './site-panel-step-toggles'

export function SitePanelEnvironmentSection({
  summary,
  targetName,
  targetEnvironment,
  importReason,
  deployReason,
  busy,
  requestRun,
  onStepsChanged
}: {
  summary: SiteSummary
  targetName: string | null
  targetEnvironment: SiteEnvironment | null
  importReason: string | null
  deployReason: string | null
  busy: boolean
  requestRun: (group: SiteRunGroup) => void
  onStepsChanged: (summary: SiteSummary) => void
}): React.JSX.Element {
  const { site, branch, resolvedEnvironment } = summary
  const environmentNames = Object.keys(site.environments)

  return (
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
          onChanged={onStepsChanged}
          importAction={
            <SiteRunQuickAction
              group="import"
              count={summary.importSelectedCount}
              disabledReason={importReason}
              busy={busy}
              onRun={() => requestRun('import')}
            />
          }
          deployAction={
            <SiteRunQuickAction
              group="deploy"
              count={summary.deploySelectedCount}
              disabledReason={deployReason}
              busy={busy}
              onRun={() => requestRun('deploy')}
            />
          }
        />
      ) : (
        <>
          <InfoRow
            label={translate('auto.components.right.sidebar.SitePanel.importSteps', 'Import steps')}
            value={String(summary.importSelectedCount)}
          />
          <InfoRow
            label={translate('auto.components.right.sidebar.SitePanel.deploySteps', 'Deploy steps')}
            value={String(summary.deploySelectedCount)}
          />
          {/* No environment to embed the actions into — keep them here so the disabled
              tooltips still explain what's missing. */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <SiteRunQuickAction
              group="import"
              count={summary.importSelectedCount}
              disabledReason={importReason}
              busy={busy}
              onRun={() => requestRun('import')}
            />
            <SiteRunQuickAction
              group="deploy"
              count={summary.deploySelectedCount}
              disabledReason={deployReason}
              busy={busy}
              onRun={() => requestRun('deploy')}
            />
          </div>
        </>
      )}
    </section>
  )
}
