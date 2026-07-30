import { useMemo } from 'react'
import type { GlobalSettings } from '../../../../shared/types'
import {
  ORCA_CLI_SKILL_INSTALL_COMMAND,
  ORCA_CLI_SKILL_NAME,
  ORCA_CLI_SKILL_UPDATE_COMMAND
} from '@/lib/agent-feature-install-commands'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkill
} from '@/hooks/useInstalledAgentSkills'
import { Label } from '../ui/label'
import { AgentSkillSetupPanel } from './AgentSkillSetupPanel'
import {
  buildSkillCommandForRuntime,
  getAgentSkillTerminalShellOverride,
  getSelectedAgentRuntime,
  getSkillDiscoveryTargetForRuntime
} from './CliSkillRuntimeSetup'
import { translate } from '@/i18n/i18n'

type CliSectionProps = {
  currentPlatform: string
  settings: GlobalSettings
  wslSupportedPlatform?: boolean
  wslAvailable?: boolean
  wslCapabilitiesLoading?: boolean
}

/**
 * Agent-skill install only. Shell PATH registration (`/usr/local/bin/orca`) was
 * gutted — packaged apps do not require a global `orca` command for normal use.
 */
export function CliSection({
  currentPlatform,
  settings,
  wslSupportedPlatform = false,
  wslAvailable = false,
  wslCapabilitiesLoading = false
}: CliSectionProps): React.JSX.Element {
  const agentRuntime = useMemo(
    () =>
      getSelectedAgentRuntime(settings, wslSupportedPlatform, wslAvailable, wslCapabilitiesLoading),
    [settings, wslAvailable, wslCapabilitiesLoading, wslSupportedPlatform]
  )
  const cliSkillDiscoveryTarget = useMemo(
    () => getSkillDiscoveryTargetForRuntime(agentRuntime),
    [agentRuntime]
  )
  const {
    installed: cliSkillDetected,
    loading: cliSkillLoading,
    error: cliSkillError,
    refresh: refreshCliSkill
  } = useInstalledAgentSkill(ORCA_CLI_SKILL_NAME, {
    discoveryTarget: cliSkillDiscoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const cliSkillInstallCommand = buildSkillCommandForRuntime(
    ORCA_CLI_SKILL_INSTALL_COMMAND,
    agentRuntime
  )
  const cliSkillUpdateCommand = buildSkillCommandForRuntime(
    ORCA_CLI_SKILL_UPDATE_COMMAND,
    agentRuntime
  )
  const cliSkillTerminalShellOverride = getAgentSkillTerminalShellOverride(
    currentPlatform,
    settings,
    agentRuntime
  )

  return (
    <section className="space-y-4" data-settings-section="cli">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">
          {translate('auto.components.settings.CliSection.c5c0f2641d', 'Muster CLI')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.CliSection.skillOnlyDescription',
            'Optional agent skill so coding agents know Muster workspace and terminal commands. No shell PATH registration required.'
          )}
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border/60 bg-card/50 p-4">
        <div className="space-y-0.5">
          <Label>
            {translate('auto.components.settings.CliSection.04873eea3e', 'Agent skills')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.CliSection.36a6f919ba',
              'Give agents Muster-aware workspace, terminal, and progress workflows.'
            )}
          </p>
        </div>

        <AgentSkillSetupPanel
          className="mt-3"
          variant="inline"
          title={translate('auto.components.settings.CliSection.6053cf736c', 'CLI skill')}
          description={translate(
            'auto.components.settings.CliSection.e8012c03a1',
            'Enables agents to use Muster workspace, terminal, and progress commands.'
          )}
          command={cliSkillInstallCommand}
          installedCommand={cliSkillUpdateCommand}
          terminalTitle="CLI skill setup"
          terminalAriaLabel="CLI skill install terminal"
          terminalWorktreeId={`settings-cli-skill-terminal-${agentRuntime.runtime}`}
          terminalShellOverride={cliSkillTerminalShellOverride}
          installed={cliSkillDetected}
          loading={cliSkillLoading}
          error={cliSkillError}
          onRecheck={refreshCliSkill}
          freshnessSkillName={agentRuntime.runtime === 'host' ? ORCA_CLI_SKILL_NAME : undefined}
        />
      </div>
    </section>
  )
}
