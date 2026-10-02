import { useMemo, useState } from 'react'
import { RefreshCw, TerminalSquare } from 'lucide-react'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { Button } from '@/components/ui/button'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { ActiveCollabAgentAccessPanel } from './activecollab-agent-access'
import { ActiveCollabMcpCredentialsRow } from './activecollab-mcp-credentials-row'
import { ActiveCollabMcpSetupTerminal } from './activecollab-mcp-setup-terminal'
import { buildActiveCollabMcpSetupCommand } from './activecollab-mcp-setup-command'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { useActiveCollabAgentAccess } from './use-activecollab-agent-access'

// Why: the MCP install is independent of the in-app ActiveCollab connection — it wires the user's
// coding agents to the standalone MCP server, so it gets its own card instead of a section whose
// visibility would hinge on an unrelated token.
export function ActiveCollabMcpInstallCard(): React.JSX.Element {
  const access = useActiveCollabAgentAccess()
  const mcp = access.mcp
  const settings = useAppStore((s) => s.settings)
  const status = mcp.status
  const [setupOpen, setSetupOpen] = useState(false)

  // The server's own interactive wizard, for people changing more than the login. Only once the
  // server exists: before that, "Give my agents access" is the whole job.
  // Why memo: the command is the terminal's only effect dependency; a fresh string respawns the PTY.
  const advancedCommand = useMemo(
    () =>
      status?.binary.found
        ? buildActiveCollabMcpSetupCommand({
            binaryPath: status.binary.path,
            platform: getShortcutPlatform(),
            windowsShell: settings?.terminalWindowsShell ?? null
          })
        : null,
    [status?.binary.found, status?.binary.path, settings?.terminalWindowsShell]
  )

  return (
    <IntegrationCardShell
      icon={<ActiveCollabIcon className="size-5" />}
      name={translate('auto.components.settings.activecollab.mcp.card_name', 'ActiveCollab MCP')}
      description={translate(
        'auto.components.settings.activecollab.mcp.card_description',
        'Give your coding agents the ActiveCollab MCP server so they can read and edit tasks directly.'
      )}
      checking={!access.checked}
      statusTone={access.loadError || !access.ready ? 'attention' : 'connected'}
      statusLabel={
        access.loadError
          ? translate(
              'auto.components.settings.activecollab.mcp.status_unavailable',
              'Status unavailable'
            )
          : !access.binaryFound
            ? translate(
                'auto.components.settings.activecollab.mcp.status_no_binary',
                'Server not installed'
              )
            : !access.ready
              ? translate('auto.components.settings.activecollab.mcp.status_setup', 'Setup needed')
              : translate('auto.components.settings.activecollab.mcp.status_current', 'Up to date')
      }
      actions={
        <>
          {advancedCommand !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              disabled={setupOpen}
              title={translate(
                'auto.components.settings.activecollab.mcp.advanced_setup_title',
                'Runs the server’s own setup wizard in a terminal.'
              )}
              onClick={() => setSetupOpen(true)}
            >
              <TerminalSquare className="size-3" />
              {translate(
                'auto.components.settings.activecollab.mcp.advanced_setup',
                'Advanced setup'
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => void access.refresh()}
          >
            <RefreshCw className={cn('size-3', !access.checked && 'animate-spin')} />
            {translate('auto.components.settings.activecollab.mcp.recheck', 'Re-check')}
          </Button>
        </>
      }
    >
      {access.checked ? (
        <IntegrationCardDetails>
          <ActiveCollabAgentAccessPanel access={access} showHeading={false} />

          {status ? (
            // Kept for rewriting the file after a token change; the access button writes it once.
            <ActiveCollabMcpCredentialsRow
              credentialsPath={status.credentialsPath}
              seeded={status.credentialsSeeded}
              busy={mcp.busy === 'credentials'}
              notice={mcp.notice?.scope === 'credentials' ? mcp.notice : null}
              onSeed={() => void mcp.seedCredentials().then(() => access.refresh())}
            />
          ) : null}

          {setupOpen && advancedCommand !== null ? (
            <ActiveCollabMcpSetupTerminal
              command={advancedCommand}
              onProcessExit={() => void access.refresh()}
              onDismiss={() => {
                setSetupOpen(false)
                void access.refresh()
              }}
            />
          ) : null}
        </IntegrationCardDetails>
      ) : null}
    </IntegrationCardShell>
  )
}
