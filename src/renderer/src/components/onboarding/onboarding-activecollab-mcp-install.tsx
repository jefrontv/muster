// Post-connect MCP install on the ActiveCollab onboarding row. Same Guided setup
// terminal Settings uses — paste the command, user presses Enter.
//
// Why every agent and not just Claude Code: this used to auto-install into
// claude-code alone and then call itself "Ready", so a Codex or Cursor user
// finished onboarding believing ActiveCollab was wired up for the agent they
// actually use. Readiness now covers every agent present on the machine, plus
// the credentials file the server cannot run without. Same rows the Settings
// card renders, so the two surfaces cannot disagree.

import { useMemo, useState } from 'react'
import { TerminalSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { ActiveCollabMcpAgentRow } from '@/components/settings/activecollab-mcp-agent-row'
import { activeCollabMcpAgentStateKind } from '@/components/settings/activecollab-mcp-agent-state'
import { ActiveCollabMcpCredentialsRow } from '@/components/settings/activecollab-mcp-credentials-row'
import { ActiveCollabMcpSetupTerminal } from '@/components/settings/activecollab-mcp-setup-terminal'
import { buildActiveCollabMcpGuidedCommand } from '@/components/settings/activecollab-mcp-setup-command'
import { useActiveCollabMcpStatus } from '@/components/settings/use-activecollab-mcp-status'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'

export function OnboardingActiveCollabMcpInstall(props: {
  compact?: boolean
}): React.JSX.Element | null {
  const { compact = false } = props
  const mcp = useActiveCollabMcpStatus()
  const windowsShell = useAppStore((s) => s.settings?.terminalWindowsShell ?? null)
  const [terminalOpen, setTerminalOpen] = useState(false)

  const status = mcp.status
  const command = useMemo(
    () =>
      buildActiveCollabMcpGuidedCommand({
        binaryPath: status?.binary.path ?? null,
        platform: getShortcutPlatform(),
        windowsShell
      }),
    [status?.binary.path, windowsShell]
  )

  const binaryFound = status?.binary.found === true
  // Agents the user does not have installed cannot be wired up and must not
  // hold the step back.
  const pendingAgents = (status?.agents ?? []).filter((agent) => {
    const kind = activeCollabMcpAgentStateKind(agent)
    return kind === 'unconfigured' || kind === 'stale'
  })
  const credentialsSeeded = status?.credentialsSeeded === true
  const ready = binaryFound && credentialsSeeded && pendingAgents.length === 0

  if (!mcp.checked) {
    return null
  }

  const pad = compact ? 'px-4' : 'px-5'
  if (mcp.loadError) {
    return (
      <div className={cn('border-t border-border py-3', pad)}>
        <p role="alert" className="text-xs break-words text-destructive">
          {mcp.loadError}
        </p>
      </div>
    )
  }

  return (
    <div className="border-t border-border" data-testid="onboarding-activecollab-mcp">
      <div className={cn('flex items-start gap-3 py-3', pad)}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-medium leading-tight text-foreground">
              {translate(
                'auto.components.onboarding.IntegrationsStep.activecollabMcp',
                'Agent access'
              )}
            </p>
            <IntegrationStatusPill tone={ready ? 'connected' : 'attention'}>
              {ready
                ? translate(
                    'auto.components.onboarding.IntegrationsStep.activecollabMcpReady',
                    'Ready'
                  )
                : translate(
                    'auto.components.onboarding.IntegrationsStep.activecollabMcpSetup',
                    'Setup needed'
                  )}
            </IntegrationStatusPill>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {ready
              ? translate(
                  'auto.components.onboarding.IntegrationsStep.activecollabMcpReadyHelp',
                  'Your agents can read and edit tasks with this login. Restart any that are already running.'
                )
              : !binaryFound
                ? translate(
                    'auto.components.onboarding.IntegrationsStep.activecollabMcpMissingHelp',
                    'Install the server so your agents can read and edit tasks with this login. Needs pipx.'
                  )
                : translate(
                    'auto.components.onboarding.IntegrationsStep.activecollabMcpAgentsHelp',
                    'Add it to each agent you use. You can change this later in Settings.'
                  )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!binaryFound && command !== null ? (
            <Button
              variant="outline"
              size="sm"
              disabled={terminalOpen}
              onClick={() => setTerminalOpen(true)}
            >
              <TerminalSquare className="size-3.5" />
              {translate('auto.components.settings.activecollab.mcp.run_setup', 'Run Setup')}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => void mcp.refresh()}>
            {translate('auto.components.onboarding.IntegrationsStep.80e3ce0bc9', 'Re-check')}
          </Button>
        </div>
      </div>

      {status ? (
        <div className={cn('space-y-2 pb-3', pad)}>
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
          {/* Without this file the server starts and then cannot authenticate,
              which looks like a broken integration rather than a missing step. */}
          <ActiveCollabMcpCredentialsRow
            credentialsPath={status.credentialsPath}
            seeded={status.credentialsSeeded}
            busy={mcp.busy === 'credentials'}
            notice={mcp.notice?.scope === 'credentials' ? mcp.notice : null}
            onSeed={() => void mcp.seedCredentials()}
          />
        </div>
      ) : null}

      {!binaryFound && terminalOpen && command !== null ? (
        <div className={cn('pb-4', pad)}>
          <ActiveCollabMcpSetupTerminal
            command={command}
            worktreeId="onboarding-activecollab-mcp"
            description={translate(
              'auto.components.onboarding.IntegrationsStep.activecollabMcpTerminalHelp',
              'Press Enter to install activecollab-mcp with pipx. Re-check after it finishes.'
            )}
            onProcessExit={() => void mcp.refresh()}
            onDismiss={() => {
              setTerminalOpen(false)
              void mcp.refresh()
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
