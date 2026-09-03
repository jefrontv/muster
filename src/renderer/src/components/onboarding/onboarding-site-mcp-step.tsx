// Registers the built-in muster-sites MCP server with the user's coding
// harnesses, during onboarding rather than after the fact in Settings.
//
// Why a step and not a row on Integrations: every other integration there is an
// account to connect. This one writes a server entry into each harness's config
// and is worth its own beat — and it only applies in Code mode, so it is
// skipped entirely for Chat (see use-onboarding-flow.ts).
//
// The status and install actions come from the same controller the Settings
// card uses, so the two surfaces can never disagree about what is installed.

import { SiteMcpHarnessRow } from '@/components/settings/site-mcp-harness-row'
import { siteMcpHarnessStateKind } from '@/components/settings/site-mcp-harness-state'
import { useSiteMcpGlobalStatus } from '@/components/settings/use-site-mcp-global-status'
import { Button } from '@/components/ui/button'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { translate } from '@/i18n/i18n'

export function OnboardingSiteMcpStep(): React.JSX.Element {
  const mcp = useSiteMcpGlobalStatus()
  const harnesses = mcp.status?.harnesses ?? []
  const needSetup = harnesses.filter((harness) => {
    const kind = siteMcpHarnessStateKind(harness)
    return kind === 'stale' || kind === 'unconfigured'
  })
  const allReady =
    mcp.checked && mcp.loadError === null && harnesses.length > 0 && needSetup.length === 0

  return (
    <div className="space-y-5" data-testid="onboarding-site-mcp-step">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold leading-tight text-foreground">
            {translate(
              'auto.components.onboarding.SiteMcpStep.title',
              'Site tools for your agents'
            )}
          </h2>
          {mcp.checked && mcp.loadError === null ? (
            <IntegrationStatusPill tone={allReady ? 'connected' : 'attention'}>
              {allReady
                ? translate('auto.components.onboarding.SiteMcpStep.status_ready', 'Installed')
                : translate('auto.components.onboarding.SiteMcpStep.status_setup', 'Setup needed')}
            </IntegrationStatusPill>
          ) : null}
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {translate(
            'auto.components.onboarding.SiteMcpStep.description',
            'Muster ships an MCP server that lets your agents run deploys and imports, query databases, and read site config. Install it into the harnesses you use. You can change this later in Settings.'
          )}
        </p>
      </div>

      {!mcp.checked ? (
        <p className="text-[13px] text-muted-foreground">
          {translate('auto.components.onboarding.SiteMcpStep.checking', 'Checking your harnesses…')}
        </p>
      ) : mcp.loadError !== null ? (
        <div className="space-y-3">
          <p role="alert" className="text-[13px] break-words text-destructive">
            {mcp.loadError}
          </p>
          <Button variant="outline" size="sm" onClick={() => void mcp.refresh()}>
            {translate('auto.components.onboarding.SiteMcpStep.retry', 'Try again')}
          </Button>
        </div>
      ) : harnesses.length === 0 ? (
        // Nothing to write into yet. Skipping is the honest outcome: Settings
        // carries the same card once a harness exists.
        <p className="text-[13px] text-muted-foreground">
          {translate(
            'auto.components.onboarding.SiteMcpStep.no_harnesses',
            'No coding harnesses found yet. Install one and Muster can register the server from Settings later.'
          )}
        </p>
      ) : (
        <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
          {harnesses.map((harness) => (
            <SiteMcpHarnessRow
              key={harness.id}
              harness={harness}
              busy={mcp.busy === harness.id}
              notice={mcp.notice?.scope === harness.id ? mcp.notice : null}
              blockedReason={null}
              onInstall={() => void mcp.install(harness.id)}
            />
          ))}
        </div>
      )}

      {mcp.checked && mcp.loadError === null && harnesses.length > 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground/70">
          {translate(
            'auto.components.onboarding.SiteMcpStep.project_note',
            'Project-level installs happen on their own: Muster keeps a muster-sites entry in each site project’s .mcp.json.'
          )}
        </p>
      ) : null}
    </div>
  )
}
