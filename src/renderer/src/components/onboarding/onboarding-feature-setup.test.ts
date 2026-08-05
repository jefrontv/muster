import { describe, expect, it, vi } from 'vitest'
import type { CliInstallStatus } from '../../../../shared/cli-install-types'
import {
  buildAgentFeatureSkillInstallCommand,
  ORCA_LINEAR_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME
} from '@/lib/agent-feature-install-commands'
import {
  ORCHESTRATION_ENABLED_STORAGE_KEY,
  ORCHESTRATION_SETUP_DISMISSED_STORAGE_KEY
} from '@/lib/orchestration-setup-state'
import {
  DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION,
  buildOnboardingFeatureSetupClipboardText,
  onboardingFeatureSetupRunTelemetry,
  onboardingFeatureSetupTelemetryFeature,
  onboardingFeatureSetupTelemetrySelection,
  runOnboardingFeatureSetup,
  type OnboardingFeatureSetupDeps,
  type OnboardingFeatureSetupSelection
} from './onboarding-feature-setup'

const ALL_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCHESTRATION_SKILL_NAME,
  ORCA_LINEAR_SKILL_NAME
])
const ORCHESTRATION_ONLY_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCHESTRATION_SKILL_NAME
])

const INSTALLED_CLI_STATUS: CliInstallStatus = {
  platform: 'darwin',
  commandName: 'orca',
  commandPath: '/usr/local/bin/orca',
  pathDirectory: '/usr/local/bin',
  pathConfigured: true,
  launcherPath: '/Applications/Muster.app/Contents/MacOS/Muster',
  installMethod: 'symlink',
  supported: true,
  state: 'installed',
  currentTarget: '/Applications/Muster.app/Contents/MacOS/Muster',
  unsupportedReason: null,
  detail: null
}

function createDeps(
  overrides: Partial<OnboardingFeatureSetupDeps> = {}
): OnboardingFeatureSetupDeps & {
  storage: Map<string, string>
  clipboardWrites: string[]
} {
  const storage = new Map<string, string>()
  const clipboardWrites: string[] = []
  return {
    storage,
    clipboardWrites,
    getCliStatus: vi.fn(async () => INSTALLED_CLI_STATUS),
    showCliRegistrationPrompt: vi.fn(async () => undefined),
    installCli: vi.fn(async () => INSTALLED_CLI_STATUS),
    writeClipboardText: vi.fn(async (text: string) => {
      clipboardWrites.push(text)
    }),
    setStorageItem: vi.fn((key: string, value: string) => {
      storage.set(key, value)
    }),
    removeStorageItem: vi.fn((key: string) => {
      storage.delete(key)
    }),
    notifyOrchestrationStateChanged: vi.fn(),
    ...overrides
  }
}

describe('onboarding feature setup runner', () => {
  it('defaults every setup item on so first-launch setup is ready to run', () => {
    expect(DEFAULT_ONBOARDING_FEATURE_SETUP_SELECTION).toEqual({
      orchestration: true,
      linearTickets: false
    })
  })

  it('builds one skill command for selected onboarding feature setup skills', () => {
    const text = buildOnboardingFeatureSetupClipboardText({
      orchestration: true,
      linearTickets: true
    })

    expect(text).toBe(ALL_SKILL_INSTALL_COMMAND)
    expect(text).toBe(
      'npx skills add https://github.com/stablyai/orca --skill orchestration orca-linear --global'
    )
  })

  it('builds privacy-safe telemetry payloads for selected feature setup items', () => {
    const selection: OnboardingFeatureSetupSelection = {
      orchestration: true,
      linearTickets: true
    }

    expect(onboardingFeatureSetupTelemetryFeature('orchestration')).toBe('orchestration')
    // Why: Linear is a recommended add-on, so it stays out of selected_count.
    expect(onboardingFeatureSetupTelemetrySelection(selection)).toEqual({
      linear_tickets: true,
      orchestration: true,
      selected_count: 1
    })
    expect(
      onboardingFeatureSetupRunTelemetry(selection, {
        selectedIds: ['orchestration', 'linearTickets'],
        cliTouched: true,
        skillCommandsCopied: false,
        skillInstallCommand: ORCHESTRATION_ONLY_SKILL_INSTALL_COMMAND,
        warnings: [{ featureId: 'skills', message: 'Clipboard unavailable' }]
      })
    ).toEqual({
      linear_tickets: true,
      orchestration: true,
      selected_count: 1,
      cli_touched: true,
      skill_commands_copied: false,
      skill_install_command_prepared: true,
      warning_count: 1
    })
  })

  it('runs selected feature setup through injected deps only', async () => {
    const deps = createDeps()

    const result = await runOnboardingFeatureSetup(
      { orchestration: true, linearTickets: true },
      deps
    )

    expect(result).toEqual({
      selectedIds: ['orchestration', 'linearTickets'],
      cliTouched: false,
      skillCommandsCopied: true,
      skillInstallCommand: ALL_SKILL_INSTALL_COMMAND,
      warnings: []
    })
    // Shell PATH registration was gutted — onboarding never probes CLI install.
    expect(deps.getCliStatus).not.toHaveBeenCalled()
    expect(deps.showCliRegistrationPrompt).not.toHaveBeenCalled()
    expect(deps.installCli).not.toHaveBeenCalled()
    expect(deps.storage.get(ORCHESTRATION_ENABLED_STORAGE_KEY)).toBe('1')
    expect(deps.removeStorageItem).toHaveBeenCalledWith(ORCHESTRATION_SETUP_DISMISSED_STORAGE_KEY)
    expect(deps.notifyOrchestrationStateChanged).toHaveBeenCalledTimes(1)
    expect(deps.clipboardWrites).toEqual([ALL_SKILL_INSTALL_COMMAND])
  })

  it('leaves the Linear add-on out of the command when only Orchestration is selected', async () => {
    const deps = createDeps()
    const selection: OnboardingFeatureSetupSelection = {
      orchestration: true,
      linearTickets: false
    }

    const result = await runOnboardingFeatureSetup(selection, deps)

    expect(result.selectedIds).toEqual(['orchestration'])
    expect(result.skillCommandsCopied).toBe(true)
    expect(result.skillInstallCommand).toBe(ORCHESTRATION_ONLY_SKILL_INSTALL_COMMAND)
    // Shell PATH registration was gutted — onboarding never probes CLI install.
    expect(deps.getCliStatus).not.toHaveBeenCalled()
    expect(deps.showCliRegistrationPrompt).not.toHaveBeenCalled()
    expect(deps.installCli).not.toHaveBeenCalled()
    expect(deps.storage.get(ORCHESTRATION_ENABLED_STORAGE_KEY)).toBe('1')
    expect(deps.clipboardWrites).toEqual([ORCHESTRATION_ONLY_SKILL_INSTALL_COMMAND])
  })

  it('clears feature markers when no setup items are selected', async () => {
    const deps = createDeps()

    const result = await runOnboardingFeatureSetup(
      { orchestration: false, linearTickets: false },
      deps
    )

    expect(result).toEqual({
      selectedIds: [],
      cliTouched: false,
      skillCommandsCopied: false,
      skillInstallCommand: null,
      warnings: []
    })
    expect(deps.storage.get(ORCHESTRATION_ENABLED_STORAGE_KEY)).toBe('0')
    expect(deps.getCliStatus).not.toHaveBeenCalled()
    expect(deps.showCliRegistrationPrompt).not.toHaveBeenCalled()
    expect(deps.clipboardWrites).toEqual([])
  })

  it('warns when selected skill commands cannot be copied', async () => {
    const deps = createDeps({
      writeClipboardText: vi.fn(async () => {
        throw new Error('Clipboard unavailable')
      })
    })

    const result = await runOnboardingFeatureSetup(
      { orchestration: true, linearTickets: false },
      deps
    )

    expect(result.skillCommandsCopied).toBe(false)
    expect(result.skillInstallCommand).toBe(ORCHESTRATION_ONLY_SKILL_INSTALL_COMMAND)
    expect(result.warnings).toEqual([
      {
        featureId: 'skills',
        message: 'Clipboard unavailable'
      }
    ])
    expect(deps.clipboardWrites).toEqual([])
  })

  it('skips shell CLI registration during onboarding after PATH setup was gutted', async () => {
    const showCliRegistrationPrompt = vi.fn(async () => undefined)
    const installCli = vi.fn(async () => INSTALLED_CLI_STATUS)
    const deps = createDeps({
      getCliStatus: vi.fn(
        async (): Promise<CliInstallStatus> => ({
          ...INSTALLED_CLI_STATUS,
          state: 'not_installed'
        })
      ),
      showCliRegistrationPrompt,
      installCli
    })

    const result = await runOnboardingFeatureSetup(
      { orchestration: true, linearTickets: false },
      deps
    )

    expect(result.cliTouched).toBe(false)
    expect(showCliRegistrationPrompt).not.toHaveBeenCalled()
    expect(installCli).not.toHaveBeenCalled()
    expect(result.warnings.filter((warning) => warning.featureId === 'cli')).toEqual([])
  })
})
