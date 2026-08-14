// Post-connect MCP install on the ActiveCollab onboarding row. Same Guided setup
// terminal Settings uses — paste the command, user presses Enter.

import { useEffect, useMemo, useRef, useState } from 'react'
import { TerminalSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
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
  const wiredRef = useRef(false)

  const command = useMemo(
    () =>
      buildActiveCollabMcpGuidedCommand({
        binaryPath: mcp.status?.binary.path ?? null,
        platform: getShortcutPlatform(),
        windowsShell
      }),
    [mcp.status?.binary.path, windowsShell]
  )

  const binaryFound = mcp.status?.binary.found === true
  const claudeConfigured =
    mcp.status?.agents.find((agent) => agent.id === 'claude-code')?.configured === true

  useEffect(() => {
    if (!binaryFound || claudeConfigured || wiredRef.current) {
      return
    }
    wiredRef.current = true
    void mcp.install('claude-code')
  }, [binaryFound, claudeConfigured, mcp])

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

  const ready = binaryFound && claudeConfigured
  const wiring = binaryFound && !claudeConfigured

  return (
    <div className="border-t border-border" data-testid="onboarding-activecollab-mcp">
      <div className={cn('flex items-start gap-3 py-3', pad)}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-medium leading-tight text-foreground">
              {translate(
                'auto.components.onboarding.IntegrationsStep.activecollabMcp',
                'Claude MCP'
              )}
            </p>
            <IntegrationStatusPill tone={ready ? 'connected' : 'attention'}>
              {ready
                ? translate(
                    'auto.components.onboarding.IntegrationsStep.activecollabMcpReady',
                    'Ready'
                  )
                : wiring
                  ? translate(
                      'auto.components.onboarding.IntegrationsStep.activecollabMcpConfiguring',
                      'Configuring…'
                    )
                  : translate(
                      'auto.components.onboarding.IntegrationsStep.activecollabMcpMissing',
                      'Not installed'
                    )}
            </IntegrationStatusPill>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {ready
              ? translate(
                  'auto.components.onboarding.IntegrationsStep.activecollabMcpReadyHelp',
                  'Claude can use this login. Restart Claude if it is already running.'
                )
              : wiring
                ? translate(
                    'auto.components.onboarding.IntegrationsStep.activecollabMcpConfiguringHelp',
                    'Writing the Claude config…'
                  )
                : translate(
                    'auto.components.onboarding.IntegrationsStep.activecollabMcpMissingHelp',
                    'Install the server so Claude can read and edit tasks with this login. Needs pipx.'
                  )}
          </p>
          {mcp.notice?.tone === 'error' ? (
            <p role="alert" className="mt-1 text-xs break-words text-destructive">
              {mcp.notice.message}
            </p>
          ) : null}
        </div>
        {!ready ? (
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                wiredRef.current = false
                void mcp.refresh()
              }}
            >
              {translate('auto.components.onboarding.IntegrationsStep.80e3ce0bc9', 'Re-check')}
            </Button>
          </div>
        ) : null}
      </div>
      {!binaryFound && terminalOpen && command !== null ? (
        <div className={cn('pb-4', pad)}>
          <ActiveCollabMcpSetupTerminal
            command={command}
            worktreeId="onboarding-activecollab-mcp"
            description={translate(
              'auto.components.onboarding.IntegrationsStep.activecollabMcpTerminalHelp',
              'Press Enter to install activecollab-mcp with pipx. Re-check after it finishes.'
            )}
            onProcessExit={() => {
              wiredRef.current = false
              void mcp.refresh()
            }}
            onDismiss={() => {
              setTerminalOpen(false)
              wiredRef.current = false
              void mcp.refresh()
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
