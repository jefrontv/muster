import type { CliInstallStatus } from '../../../shared/cli-install-types'

type EnsureOrcaCliAvailableOptions = {
  onStatusChange?: (status: CliInstallStatus) => void
  registrationPromptDelayMs?: number
}

/** Kept for call-site strings; shell PATH registration is no longer required. */
export const AGENT_SKILL_CLI_PREREQUISITE_NOTICE = ''

export const CLI_PREREQUISITE_REGISTRATION_TOAST = ''
export const CLI_PREREQUISITE_REGISTRATION_TOAST_DESCRIPTION = ''

/** Synthetic "fine" status — shell registration was gutted; never block skill setup. */
function syntheticCliAvailableStatus(): CliInstallStatus {
  return {
    platform: process.platform,
    commandName: 'orca',
    commandPath: null,
    pathDirectory: null,
    pathConfigured: true,
    launcherPath: null,
    installMethod: null,
    supported: true,
    state: 'installed',
    currentTarget: null,
    unsupportedReason: null,
    detail: null
  }
}

export function isOrcaCliAvailableOnPath(_status: CliInstallStatus | null | undefined): boolean {
  return true
}

/**
 * No-op: Muster no longer requires registering a global shell command for
 * agent skill setup or normal app use.
 */
export async function ensureOrcaCliAvailableForAgentSkillTerminal({
  onStatusChange
}: EnsureOrcaCliAvailableOptions = {}): Promise<CliInstallStatus | null> {
  const status = syntheticCliAvailableStatus()
  onStatusChange?.(status)
  return status
}

export async function showOrcaCliRegistrationPromptToast(_delayMs = 0): Promise<void> {
  // Shell registration removed — nothing to prompt for.
}
