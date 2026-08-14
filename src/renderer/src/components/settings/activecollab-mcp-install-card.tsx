import { useMemo, useState } from 'react'
import { RefreshCw, TerminalSquare } from 'lucide-react'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { Button } from '@/components/ui/button'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { ActiveCollabMcpAgentRow } from './activecollab-mcp-agent-row'
import { activeCollabMcpAgentStateKind } from './activecollab-mcp-agent-state'
import { ActiveCollabMcpBinaryRow } from './activecollab-mcp-binary-row'
import { ActiveCollabMcpCredentialsRow } from './activecollab-mcp-credentials-row'
import { ActiveCollabMcpSetupTerminal } from './activecollab-mcp-setup-terminal'
import { buildActiveCollabMcpGuidedCommand } from './activecollab-mcp-setup-command'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { useActiveCollabMcpStatus } from './use-activecollab-mcp-status'

// Why: the MCP install is independent of the in-app ActiveCollab connection — it wires the user's
// coding agents to the standalone MCP server, so it gets its own card instead of a section whose
// visibility would hinge on an unrelated token.
export function ActiveCollabMcpInstallCard(): React.JSX.Element {
  const mcp = useActiveCollabMcpStatus()
  const settings = useAppStore((s) => s.settings)
  const status = mcp.status
  const [setupOpen, setSetupOpen] = useState(false)
  const needSetup = (status?.agents ?? []).filter((agent) => {
    const kind = activeCollabMcpAgentStateKind(agent)
    return kind === 'stale' || kind === 'unconfigured'
  }).length

  // Why memo: the command is the setup terminal's only effect dependency, so a fresh string every
  // render would tear down and respawn the PTY under the user mid-question.
  const setupCommand = useMemo(
    () =>
      buildActiveCollabMcpGuidedCommand({
        binaryPath: status?.binary.path ?? null,
        platform: getShortcutPlatform(),
        windowsShell: settings?.terminalWindowsShell ?? null
      }),
    [status?.binary.path, settings?.terminalWindowsShell]
  )

  return (
    <IntegrationCardShell
      icon={<ActiveCollabIcon className="size-5" />}
      name={translate('auto.components.settings.activecollab.mcp.card_name', 'ActiveCollab MCP')}
      description={translate(
        'auto.components.settings.activecollab.mcp.card_description',
        'Give your coding agents the ActiveCollab MCP server so they can read and edit tasks directly.'
      )}
      checking={!mcp.checked}
      statusTone={
        mcp.loadError || !status?.binary.found || needSetup > 0 ? 'attention' : 'connected'
      }
      statusLabel={
        mcp.loadError
          ? translate(
              'auto.components.settings.activecollab.mcp.status_unavailable',
              'Status unavailable'
            )
          : !status?.binary.found
            ? translate(
                'auto.components.settings.activecollab.mcp.status_no_binary',
                'Server not installed'
              )
            : needSetup > 0
              ? translate('auto.components.settings.activecollab.mcp.status_setup', 'Setup needed')
              : translate('auto.components.settings.activecollab.mcp.status_current', 'Up to date')
      }
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={setupOpen || setupCommand === null}
            title={
              setupCommand === null
                ? translate(
                    'auto.components.settings.activecollab.mcp.run_setup_blocked',
                    'The detected server path cannot be quoted for this shell.'
                  )
                : !status?.binary.found
                  ? translate(
                      'auto.components.settings.activecollab.mcp.run_setup_install',
                      'Opens a terminal with pipx install. Press Enter to run it.'
                    )
                  : undefined
            }
            onClick={() => setSetupOpen(true)}
          >
            <TerminalSquare className="size-3" />
            {translate('auto.components.settings.activecollab.mcp.run_setup', 'Run Setup')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => void mcp.refresh()}
          >
            <RefreshCw className={cn('size-3', !mcp.checked && 'animate-spin')} />
            {translate('auto.components.settings.activecollab.mcp.recheck', 'Re-check')}
          </Button>
        </>
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
              <ActiveCollabMcpBinaryRow binary={status.binary} />

              {status.agents.map((agent) => (
                <ActiveCollabMcpAgentRow
                  key={agent.id}
                  agent={agent}
                  binary={status.binary}
                  busy={mcp.busy === agent.id}
                  notice={mcp.notice?.scope === agent.id ? mcp.notice : null}
                  onInstall={() => void mcp.install(agent.id)}
                />
              ))}

              <ActiveCollabMcpCredentialsRow
                credentialsPath={status.credentialsPath}
                seeded={status.credentialsSeeded}
                busy={mcp.busy === 'credentials'}
                notice={mcp.notice?.scope === 'credentials' ? mcp.notice : null}
                onSeed={() => void mcp.seedCredentials()}
              />

              {setupOpen && setupCommand !== null ? (
                <ActiveCollabMcpSetupTerminal
                  command={setupCommand}
                  onProcessExit={() => void mcp.refresh()}
                  onDismiss={() => {
                    setSetupOpen(false)
                    // Why refresh here too: cancelling kills setup part-way, which is exactly when
                    // the card's picture of which agents are registered is most likely stale.
                    void mcp.refresh()
                  }}
                />
              ) : null}
            </>
          ) : null}
        </IntegrationCardDetails>
      ) : null}
    </IntegrationCardShell>
  )
}
