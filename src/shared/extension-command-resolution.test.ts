import { describe, expect, it } from 'vitest'
import type { ExtensionEntry } from './extension-catalog-types'
import type { ExtensionState } from './extension-state-types'
import {
  canWireHarnesses,
  harnessesNeedingSetup,
  resolveExtensionCommand
} from './extension-command-resolution'

function state(overrides: Partial<ExtensionState> = {}): ExtensionState {
  return {
    id: 'acme',
    installed: false,
    installedVersion: null,
    latestVersion: null,
    status: 'not-installed',
    binaryPath: null,
    harnesses: [],
    autoUpdateSupported: false,
    autoUpdateEnabled: false,
    ...overrides
  }
}

function entry(install: ExtensionEntry['install']): ExtensionEntry {
  return {
    id: 'acme',
    kind: 'mcp',
    name: 'Acme',
    description: '',
    keywords: [],
    version: '1.0.0',
    install,
    latest: { source: 'pinned' }
  }
}

describe('resolveExtensionCommand', () => {
  it('offers the install command when nothing is installed', () => {
    const result = resolveExtensionCommand(
      entry({ method: 'command', command: { install: 'brew install acme' } }),
      state()
    )
    expect(result).toEqual({ kind: 'install', command: 'brew install acme' })
  })

  it('offers the update command once something is installed', () => {
    const result = resolveExtensionCommand(
      entry({
        method: 'command',
        command: { install: 'pipx install acme', update: 'pipx install --force acme' }
      }),
      state({ installed: true })
    )
    expect(result).toEqual({ kind: 'update', command: 'pipx install --force acme' })
  })

  it('falls back to the install command when no update command is given', () => {
    const result = resolveExtensionCommand(
      entry({ method: 'command', command: { install: 'npm i -g acme' } }),
      state({ installed: true })
    )
    expect(result).toEqual({ kind: 'update', command: 'npm i -g acme' })
  })

  it('offers nothing to install when the catalog carries only an update route', () => {
    const result = resolveExtensionCommand(
      entry({ method: 'command', command: { update: 'agent-local update' } }),
      state()
    )
    expect(result).toBeNull()
  })

  it('reads a config-write entry’s provision command', () => {
    const result = resolveExtensionCommand(
      entry({
        method: 'config-write',
        provision: { install: 'pipx install acme' },
        server: { key: 'acme', harnesses: [] }
      }),
      state()
    )
    expect(result).toEqual({ kind: 'install', command: 'pipx install acme' })
  })

  it('offers nothing for a bundled skill', () => {
    expect(
      resolveExtensionCommand(entry({ method: 'bundled-skill', skill: 'acme' }), state())
    ).toBeNull()
  })
})

describe('canWireHarnesses', () => {
  const withProvision = entry({
    method: 'config-write',
    provision: { install: 'pipx install acme' },
    server: { key: 'acme', harnesses: [] }
  })

  it('refuses while the server it would point at is missing', () => {
    expect(canWireHarnesses(withProvision, state({ installed: false }))).toBe(false)
  })

  it('allows it once the server is installed', () => {
    expect(canWireHarnesses(withProvision, state({ installed: true }))).toBe(true)
  })

  it('allows an entry with nothing to provision', () => {
    const httpOnly = entry({ method: 'config-write', server: { key: 'acme', harnesses: [] } })
    expect(canWireHarnesses(httpOnly, state())).toBe(true)
  })

  it('is false for anything that is not a config write', () => {
    expect(canWireHarnesses(entry({ method: 'bundled-skill', skill: 'acme' }), state())).toBe(false)
  })
})

describe('harnessesNeedingSetup', () => {
  it('counts unconfigured and stale rows alike', () => {
    const harness = (id: string, configured: boolean, current: boolean): never =>
      ({ id, label: id, configPath: '/x', present: true, configured, current }) as never
    expect(
      harnessesNeedingSetup(
        state({
          harnesses: [
            harness('claude-code', true, true),
            harness('codex', true, false),
            harness('cursor', false, false)
          ]
        })
      )
    ).toBe(2)
  })
})

describe('taking over an external install', () => {
  const provisioned = entry({
    method: 'config-write',
    provision: { install: 'npm i -g acme', update: 'npm i -g acme@latest' },
    server: { key: 'acme', harnesses: [] }
  })

  it('offers Install, not Update, while only someone else’s copy is wired', () => {
    const result = resolveExtensionCommand(
      provisioned,
      state({ installed: true, externallyManaged: true })
    )
    expect(result).toEqual({ kind: 'install', command: 'npm i -g acme' })
  })

  it('offers Update once the managed copy is the one installed', () => {
    const result = resolveExtensionCommand(provisioned, state({ installed: true }))
    expect(result).toEqual({ kind: 'update', command: 'npm i -g acme@latest' })
  })

  it('shows the harness rows so the user can see what they are pointed at', () => {
    expect(
      canWireHarnesses(
        provisioned,
        state({
          installed: true,
          externallyManaged: true,
          harnesses: [
            {
              id: 'claude-code',
              label: 'Claude Code',
              configPath: '/x',
              present: true,
              configured: true,
              current: false
            }
          ]
        })
      )
    ).toBe(true)
  })
})
