import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSettingsNavigationMetadata } from './useSettingsNavigationMetadata'
import type { Repo } from '../../../shared/types'

const repo = {
  id: 'repo-1',
  path: '/repo',
  displayName: 'Repo',
  badgeColor: '#000',
  addedAt: 0
} satisfies Repo

function ids(
  args: {
    isMac?: boolean
    isWindows?: boolean
    isWebClient?: boolean
    isDev?: boolean
    isLinearConnected?: boolean
    showHiddenSections?: boolean
  } = {}
): string[] {
  return buildSettingsNavigationMetadata({
    isMac: args.isMac ?? false,
    isWindows: args.isWindows ?? false,
    isWebClient: args.isWebClient ?? false,
    isDev: args.isDev ?? false,
    isLinearConnected: args.isLinearConnected ?? false,
    showHiddenSections: args.showHiddenSections ?? false,
    repos: [repo]
  }).map((section) => section.id)
}

describe('settings navigation metadata', () => {
  it('puts AI capability panes at the top on desktop', () => {
    expect(ids().slice(0, 8)).toEqual([
      'agents',
      'accounts',
      'agent-capabilities',
      'voice',
      'setup-guide',
      'general',
      'integrations',
      'git'
    ])
  })

  it('hides the panes this fork does not offer, on every platform', () => {
    // Orchestration installs itself now, and Mobile is an upstream capability
    // this fork does not support — a pane that only offers to install one is a dead end.
    for (const hidden of ['orchestration', 'mobile']) {
      expect(ids(), hidden).not.toContain(hidden)
      expect(ids({ isWebClient: true }), hidden).not.toContain(hidden)
    }
  })

  it('restores every hidden pane when the Advanced escape hatch is on', () => {
    const shown = ids({ showHiddenSections: true })
    for (const hidden of ['orchestration', 'mobile']) {
      expect(shown, hidden).toContain(hidden)
    }
  })

  it('keeps the un-hide flag from inventing panes the platform does not have', () => {
    // Mobile is a desktop-only entry; the flag lifts the fork's filter, it does
    // not bypass the platform gate above it.
    const shown = ids({ isWebClient: true, showHiddenSections: true })
    expect(shown).toContain('orchestration')
    expect(shown).not.toContain('mobile')
  })

  it('lists Agent Capabilities beside the other AI capability panes', () => {
    const sections = buildSettingsNavigationMetadata({
      isMac: false,
      isWindows: false,
      isWebClient: false,
      repos: [repo]
    })
    const section = sections.find((entry) => entry.id === 'agent-capabilities')
    expect(section?.group).toBe('capabilities')
    expect(section?.searchEntries.length).toBeGreaterThan(0)
  })

  it('keeps Agent Capabilities off web clients, which have no local bundle or MCP config', () => {
    expect(ids({ isWebClient: true })).not.toContain('agent-capabilities')
    expect(ids({ isWebClient: true, showHiddenSections: true })).not.toContain('agent-capabilities')
  })

  it('adds the Linear capability section only when connected', () => {
    expect(ids()).not.toContain('linear')

    const connectedIds = ids({ isLinearConnected: true })
    expect(connectedIds).toContain('linear')
    // Orchestration used to anchor its position; with that pane hidden, Linear follows the
    // Agent Capabilities pane that now sits between it and Accounts.
    expect(connectedIds.indexOf('linear')).toBe(connectedIds.indexOf('agent-capabilities') + 1)

    const linearSection = buildSettingsNavigationMetadata({
      isMac: false,
      isWindows: false,
      isWebClient: false,
      isLinearConnected: true,
      repos: [repo]
    }).find((section) => section.id === 'linear')
    expect(linearSection?.group).toBe('capabilities')
  })

  it('keeps the Linear capability section available on web clients when connected', () => {
    expect(ids({ isWebClient: true, isLinearConnected: true })).toContain('linear')
  })

  it('puts web-safe AI capability panes at the top while hiding desktop-only panes', () => {
    expect(ids({ isWebClient: true }).slice(0, 6)).toEqual([
      'agents',
      'accounts',
      'setup-guide',
      'general',
      'integrations',
      'git'
    ])
  })

  it('keeps desktop-only Settings panes out of web metadata', () => {
    const webIds = ids({ isWebClient: true })

    expect(webIds).not.toContain('browser')
    expect(webIds).not.toContain('ssh')
    expect(webIds).not.toContain('mobile')
    expect(webIds).not.toContain('voice')
    expect(webIds).not.toContain('advanced')
    expect(webIds).toContain('servers')
    expect(webIds).toContain('repo-repo-1')
  })

  it('does not mark installable AI capabilities as beta in the sidebar metadata', () => {
    const sections = buildSettingsNavigationMetadata({
      isMac: true,
      isWindows: false,
      isWebClient: false,
      repos: [repo]
    })

    expect(sections.find((section) => section.id === 'voice')?.badge).toBeUndefined()
  })

  it('places per-workspace environments under Experimental instead of as a beta sidebar item', () => {
    const sections = buildSettingsNavigationMetadata({
      isMac: false,
      isWindows: false,
      isWebClient: false,
      repos: [repo]
    })
    const experimental = sections.find((section) => section.id === 'experimental')
    const entry = experimental?.searchEntries.find(
      (searchEntry) => searchEntry.title === 'Per-Workspace Environments'
    )

    expect(sections.map((section) => section.id)).not.toContain('ephemeral-vms')
    expect(experimental?.group).toBe('experimental')
    expect(entry?.targetSectionId).toBe('ephemeral-vms')
  })

  it('omits Windows project runtime search entries when the active host is unsupported', () => {
    const sections = buildSettingsNavigationMetadata({
      isMac: false,
      isWindows: false,
      isWindowsTerminalHost: false,
      isWebClient: false,
      repos: [repo]
    })

    const general = sections.find((section) => section.id === 'general')
    const repoSection = sections.find((section) => section.id === 'repo-repo-1')

    expect(general?.searchEntries.some((entry) => entry.title === 'Default Project Runtime')).toBe(
      false
    )
    expect(repoSection?.searchEntries.some((entry) => entry.title === 'Project Runtime')).toBe(
      false
    )
  })

  it('includes project runtime search entries for local repos on Windows hosts', () => {
    const sections = buildSettingsNavigationMetadata({
      isMac: false,
      isWindows: true,
      isWebClient: false,
      repos: [repo]
    })

    const general = sections.find((section) => section.id === 'general')
    const repoSection = sections.find((section) => section.id === 'repo-repo-1')

    expect(general?.searchEntries.some((entry) => entry.title === 'Default Project Runtime')).toBe(
      true
    )
    expect(repoSection?.searchEntries.some((entry) => entry.title === 'Project Runtime')).toBe(true)
  })

  it('surfaces Windows-host and universal terminal settings in Windows-host metadata', () => {
    const sections = buildSettingsNavigationMetadata({
      isMac: false,
      isWindows: false,
      isWindowsTerminalHost: true,
      isWebClient: false,
      repos: [repo]
    })

    const terminal = sections.find((section) => section.id === 'terminal')

    expect(terminal?.searchEntries.some((entry) => entry.title === 'Default Shell')).toBe(true)
    expect(terminal?.searchEntries.some((entry) => entry.title === 'PowerShell Version')).toBe(true)
    // Right-click to paste is now exposed on every platform (#8322), so it is
    // indexed even when only the terminal host — not the client — is Windows.
    expect(terminal?.searchEntries.some((entry) => entry.title === 'Right-click to paste')).toBe(
      true
    )
  })

  it('places Advanced near the bottom on desktop without putting it under Experimental', () => {
    const desktopIds = ids()

    expect(desktopIds).toContain('advanced')
    expect(desktopIds.indexOf('advanced')).toBeLessThan(desktopIds.indexOf('experimental'))
    expect(desktopIds.indexOf('privacy')).toBeLessThan(desktopIds.indexOf('advanced'))
  })

  // Note: this exercises the isDev parameter and isWebClient branches only.
  // Production safety rests on the hard `import.meta.env.DEV` term in the
  // builder, which is compile-time-inlined per build and cannot be flipped from
  // a test (vitest always runs with DEV=true) — don't mistake this for full
  // prod-gate coverage. The bundle exclusion is what guarantees prod safety.
  it('shows Dev tools only in desktop development metadata', () => {
    expect(ids()).not.toContain('dev')
    expect(ids({ isDev: true })).toContain('dev')
    expect(ids({ isDev: true, isWebClient: true })).not.toContain('dev')
  })

  it('renders one repo nav section per project even across execution hosts', () => {
    const gitRemote = {
      canonicalKey: 'gitlab.com/acme/app',
      remoteName: 'origin',
      remoteUrl: 'git@gitlab.com:acme/app.git'
    }
    const sections = buildSettingsNavigationMetadata({
      isMac: false,
      isWindows: false,
      isWebClient: false,
      repos: [
        {
          id: 'local-1',
          path: '/a',
          displayName: 'App',
          badgeColor: '#000',
          addedAt: 0,
          gitRemoteIdentity: gitRemote
        },
        {
          id: 'remote-9',
          path: '/b',
          displayName: 'App',
          badgeColor: '#000',
          addedAt: 0,
          gitRemoteIdentity: gitRemote,
          executionHostId: 'runtime:home-mac'
        }
      ]
    })

    const repoSections = sections.filter((section) => section.id.startsWith('repo-'))
    expect(repoSections).toHaveLength(1)
    expect(repoSections[0].id).toBe('repo-local-1')
  })

  it('keeps macOS permissions mac-only', () => {
    expect(ids({ isMac: false })).not.toContain('developer-permissions')
    expect(ids({ isMac: true })).toContain('developer-permissions')
  })

  it('does not import Settings page or pane UI modules from the metadata hook', () => {
    const testDir = import.meta.dirname
    const hookSource = readFileSync(resolve(testDir, 'useSettingsNavigationMetadata.ts'), 'utf8')
    const importLines = hookSource
      .split('\n')
      .filter((line) => line.trim().startsWith('import '))
      .join('\n')

    expect(importLines).not.toMatch(/components\/settings\/Settings(?:'|")/)
    expect(importLines).not.toMatch(/components\/settings\/[A-Z][A-Za-z]+Pane(?:'|")/)
    expect(importLines).not.toMatch(/components\/stats\/StatsPane(?:'|")/)
  })

  it('does not import Settings page or pane UI modules from the quick action registry', () => {
    const testDir = import.meta.dirname
    const registrySource = readFileSync(
      resolve(testDir, '../components/cmd-j/quick-actions.ts'),
      'utf8'
    )
    const importLines = registrySource
      .split('\n')
      .filter((line) => line.trim().startsWith('import '))
      .join('\n')

    expect(importLines).not.toMatch(/components\/settings\/Settings(?:'|")/)
    expect(importLines).not.toMatch(/components\/settings\/[A-Z][A-Za-z]+Pane(?:'|")/)
    expect(importLines).not.toMatch(/components\/stats\/StatsPane(?:'|")/)
  })
})
