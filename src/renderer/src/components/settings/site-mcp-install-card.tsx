import { RefreshCw, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'
import { SiteMcpHarnessRow } from './site-mcp-harness-row'
import { siteMcpHarnessStateKind } from './site-mcp-harness-state'
import { useSiteMcpGlobalStatus } from './use-site-mcp-global-status'

// The global install card for the built-in muster-sites MCP server, mirroring the ActiveCollab MCP
// card. The server is Muster itself and resolves the site from the CWD the harness spawns it in,
// so one entry in a harness's user-global config serves every project.
export function SiteMcpInstallCard({ enabled }: { enabled: boolean }): React.JSX.Element {
  const mcp = useSiteMcpGlobalStatus()
  const status = mcp.status
  const commandRowClass = useIntegrationSubordinateRowClass('space-y-1')
  const needSetup = (status?.harnesses ?? []).filter((harness) => {
    const kind = siteMcpHarnessStateKind(harness)
    return kind === 'stale' || kind === 'unconfigured'
  }).length

  // Why the card never hides: the toggle governs the AGENTS' access, not the user's visibility —
  // the state stays readable, only the writes are blocked.
  const blockedReason = enabled
    ? null
    : translate(
        'auto.components.settings.siteMcp.install_blocked_disabled',
        'Site tools are switched off above, so agents would not be allowed to call this server anyway. Turn them on to install.'
      )

  return (
    <IntegrationCardShell
      icon={<Server className="size-5" />}
      name={translate('auto.components.settings.siteMcp.card_name', 'muster-sites MCP')}
      description={translate(
        'auto.components.settings.siteMcp.card_description',
        'Register the built-in site MCP server with your coding harnesses so agents can run deploys, imports, and database queries.'
      )}
      checking={!mcp.checked}
      statusTone={mcp.loadError || needSetup > 0 ? 'attention' : 'connected'}
      statusLabel={
        mcp.loadError
          ? translate('auto.components.settings.siteMcp.status_unavailable', 'Status unavailable')
          : needSetup > 0
            ? translate('auto.components.settings.siteMcp.status_setup', 'Setup needed')
            : translate('auto.components.settings.siteMcp.status_current', 'Up to date')
      }
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => void mcp.refresh()}
        >
          <RefreshCw className={cn('size-3', !mcp.checked && 'animate-spin')} />
          {translate('auto.components.settings.siteMcp.recheck', 'Re-check')}
        </Button>
      }
    >
      {mcp.checked ? (
        <IntegrationCardDetails>
          {mcp.loadError ? (
            <p role="alert" className="text-xs break-words text-destructive">
              {mcp.loadError}
            </p>
          ) : null}

          {status ? (
            <>
              <div className={commandRowClass} data-testid="site-mcp-command">
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.settings.siteMcp.command_label',
                    'Each entry spawns this build directly:'
                  )}
                </p>
                <p
                  className="truncate font-mono text-[11px] text-muted-foreground/80"
                  title={[status.command.command, ...status.command.args].join(' ')}
                >
                  {[status.command.command, ...status.command.args].join(' ')}
                </p>
              </div>

              {status.harnesses.map((harness) => (
                <SiteMcpHarnessRow
                  key={harness.id}
                  harness={harness}
                  busy={mcp.busy === harness.id}
                  notice={mcp.notice?.scope === harness.id ? mcp.notice : null}
                  blockedReason={blockedReason}
                  onInstall={() => void mcp.install(harness.id)}
                />
              ))}

              <p className="text-xs text-muted-foreground/70">
                {translate(
                  'auto.components.settings.siteMcp.workspace_note',
                  'Project-level installs are automatic: Muster keeps a muster-sites entry in each site project\u2019s .mcp.json on its own.'
                )}
              </p>
            </>
          ) : null}
        </IntegrationCardDetails>
      ) : null}
    </IntegrationCardShell>
  )
}
