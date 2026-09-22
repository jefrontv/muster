import { describe, expect, it, vi } from 'vitest'
import type { ExtensionCatalog, ExtensionEntry } from '../../shared/extension-catalog-types'
import {
  eligibleExtensionAutoUpdates,
  visibleExtensionHarnesses,
  type ExtensionHarnessState
} from '../../shared/extension-state-types'
import { inventoryExtensions, type ExtensionInventoryEnv } from './extension-inventory'

function env(overrides: Partial<ExtensionInventoryEnv> = {}): ExtensionInventoryEnv {
  return {
    platform: 'darwin',
    probeBinary: () => ({
      found: false,
      path: null,
      realPath: null,
      version: null,
      versionSource: null
    }),
    readHarnessStates: () => [],
    probeLatest: async () => null,
    probeAccess: async () => undefined,
    skillStatus: async () => null,
    readAgentLocal: async () => ({ version: null, latest: null }),
    readVersionByCommand: async () => null,
    autoUpdate: { master: false, entries: {} },
    ...overrides
  }
}

const commandEntry: ExtensionEntry = {
  id: 'acme',
  kind: 'app',
  name: 'Acme',
  description: 'Does Acme things.',
  keywords: [],
  version: '1.0.0',
  install: { method: 'command', command: { install: 'brew install acme', binary: 'acme' } },
  latest: { source: 'pinned' },
  autoUpdate: { supported: true }
}

function catalogOf(...entries: ExtensionEntry[]): ExtensionCatalog {
  return { schemaVersion: 1, updatedAt: '2026-09-22', entries }
}

async function stateOf(
  entry: ExtensionEntry,
  overrides: Partial<ExtensionInventoryEnv> = {}
): Promise<Awaited<ReturnType<typeof inventoryExtensions>>[number]['state']> {
  const [result] = await inventoryExtensions(catalogOf(entry), env(overrides))
  return result.state
}

const foundAt = (path: string, version: string | null) => () => ({
  found: true,
  path,
  realPath: path,
  version,
  versionSource: version ? ('pipx' as const) : null
})

describe('inventoryExtensions', () => {
  it('reports a missing binary as not installed', async () => {
    expect(await stateOf(commandEntry)).toMatchObject({ installed: false, status: 'not-installed' })
  })

  it('compares an installed version against the catalog floor', async () => {
    const state = await stateOf(commandEntry, {
      probeBinary: foundAt('/usr/bin/acme', '0.9.0')
    })
    expect(state).toMatchObject({ status: 'outdated', installedVersion: '0.9.0', latestVersion: '1.0.0' })
  })

  it('prefers a probed version over the catalog floor', async () => {
    const state = await stateOf(
      { ...commandEntry, latest: { source: 'pypi', package: 'acme' } },
      { probeBinary: foundAt('/usr/bin/acme', '1.0.0'), probeLatest: async () => '1.2.0' }
    )
    expect(state).toMatchObject({ status: 'outdated', latestVersion: '1.2.0' })
  })

  it('keeps the catalog floor when a probe cannot answer', async () => {
    const state = await stateOf(
      { ...commandEntry, latest: { source: 'pypi', package: 'acme' } },
      { probeBinary: foundAt('/usr/bin/acme', '1.0.0'), probeLatest: async () => null }
    )
    expect(state).toMatchObject({ status: 'current', latestVersion: '1.0.0' })
  })

  it('says unknown rather than current when the installed version cannot be read', async () => {
    const state = await stateOf(commandEntry, { probeBinary: foundAt('/usr/bin/acme', null) })
    expect(state).toMatchObject({ installed: true, status: 'unknown' })
  })

  it('gates an entry off its platform without pretending it is missing', async () => {
    const state = await stateOf({ ...commandEntry, platforms: ['darwin'] }, { platform: 'win32' })
    expect(state.status).toBe('unsupported-platform')
    expect(state.detail).toContain('does not run')
  })

  it('greys an entry whose repository the user cannot reach', async () => {
    const state = await stateOf(
      { ...commandEntry, access: { kind: 'git-ssh', remote: 'git@example.com:a/b.git' } },
      { probeAccess: async () => false }
    )
    expect(state).toMatchObject({ status: 'no-access', accessGranted: false })
  })

  it('leaves an entry usable when the access probe cannot decide', async () => {
    const state = await stateOf(
      { ...commandEntry, access: { kind: 'git-ssh', remote: 'git@example.com:a/b.git' } },
      { probeAccess: async () => undefined, probeBinary: foundAt('/usr/bin/acme', '1.0.0') }
    )
    expect(state.status).toBe('current')
    expect(state.accessGranted).toBeUndefined()
  })

  it('asks Agent Local for both of its versions', async () => {
    const state = await stateOf(
      {
        ...commandEntry,
        id: 'agent-local',
        latest: { source: 'agent-local-daemon' },
        install: { method: 'command', command: { update: 'agent-local update', binary: 'agent-local' } }
      },
      {
        probeBinary: foundAt('/usr/local/bin/agent-local', null),
        readAgentLocal: async () => ({ version: '0.34.1', latest: '0.35.0' })
      }
    )
    expect(state).toMatchObject({ installedVersion: '0.34.1', latestVersion: '0.35.0', status: 'outdated' })
  })

  it('counts a config-write entry with no provision by its wiring', async () => {
    const entry: ExtensionEntry = {
      ...commandEntry,
      kind: 'mcp',
      install: {
        method: 'config-write',
        server: {
          key: 'acme',
          harnesses: [{ id: 'cursor', transport: { kind: 'http', url: 'http://127.0.0.1:1/mcp' } }]
        }
      }
    }
    const state = await stateOf(entry, {
      readHarnessStates: () => [
        {
          id: 'cursor',
          label: 'Cursor',
          configPath: '/home/dev/.cursor/mcp.json',
          present: true,
          configured: true,
          current: true
        }
      ]
    })
    expect(state.installed).toBe(true)
  })

  it('reports a bundled skill through the skill inventory', async () => {
    const entry: ExtensionEntry = {
      ...commandEntry,
      kind: 'skill',
      install: { method: 'bundled-skill', skill: 'acme-skill' }
    }
    const state = await stateOf(entry, {
      skillStatus: async () => ({ installed: true, outdated: true })
    })
    expect(state.status).toBe('outdated')
  })

  it('never offers auto-update on a bundled skill the app updater owns', async () => {
    const entry: ExtensionEntry = {
      ...commandEntry,
      kind: 'skill',
      install: { method: 'bundled-skill', skill: 'acme-skill' },
      autoUpdate: { supported: true }
    }
    const state = await stateOf(entry, {
      skillStatus: async () => ({ installed: true, outdated: true })
    })
    expect(state.autoUpdateSupported).toBe(false)
  })

  it('lets the master switch set a default that a per-entry choice overrides', async () => {
    const on = await stateOf(commandEntry, { autoUpdate: { master: true, entries: {} } })
    expect(on.autoUpdateEnabled).toBe(true)

    const pinned = await stateOf(commandEntry, {
      autoUpdate: { master: true, entries: { acme: false } }
    })
    expect(pinned.autoUpdateEnabled).toBe(false)
  })

  it('probes entries concurrently rather than queueing them', async () => {
    const probeLatest = vi.fn().mockResolvedValue('2.0.0')
    await inventoryExtensions(
      catalogOf(commandEntry, { ...commandEntry, id: 'acme-two' }),
      env({ probeLatest, probeBinary: foundAt('/usr/bin/acme', '1.0.0') })
    )
    expect(probeLatest).toHaveBeenCalledTimes(2)
  })
})

describe('eligibleExtensionAutoUpdates', () => {
  it('picks only outdated, supported, enabled entries', async () => {
    const entries = await inventoryExtensions(
      catalogOf(
        commandEntry,
        { ...commandEntry, id: 'manual', autoUpdate: { supported: false, reason: 'sudo' } },
        {
          ...commandEntry,
          id: 'current-one',
          install: { method: 'command', command: { install: 'brew install x', binary: 'x' } }
        }
      ),
      env({
        autoUpdate: { master: true, entries: {} },
        probeBinary: (binary) =>
          binary === 'acme'
            ? { found: true, path: '/usr/bin/acme', realPath: '/usr/bin/acme', version: '0.1.0', versionSource: 'pipx' }
            : { found: true, path: '/usr/bin/x', realPath: '/usr/bin/x', version: '1.0.0', versionSource: 'pipx' }
      })
    )

    const eligible = eligibleExtensionAutoUpdates({
      schemaVersion: 1,
      entries,
      catalogOrigin: 'bundled',
      catalogUpdatedAt: '2026-09-22',
      scannedAt: 0
    })

    expect(eligible.map(({ entry }) => entry.id)).toEqual(['acme'])
  })
})

describe('an extension already set up outside Muster', () => {
  const wired = (configured: boolean) => () => [
    {
      id: 'claude-code' as const,
      label: 'Claude Code',
      configPath: '/home/dev/.claude.json',
      present: true,
      configured,
      current: false
    }
  ]

  const provisioned: ExtensionEntry = {
    ...commandEntry,
    kind: 'mcp',
    install: {
      method: 'config-write',
      provision: { install: 'npm i -g acme', binary: 'acme-mcp' },
      server: {
        key: 'acme',
        harnesses: [
          {
            id: 'claude-code',
            transport: { kind: 'stdio', binary: 'acme-mcp', args: [], env: {} }
          }
        ]
      }
    }
  }

  it('counts a harness entry pointing elsewhere as installed, not missing', async () => {
    const state = await stateOf(provisioned, { readHarnessStates: wired(true) })
    expect(state.installed).toBe(true)
    expect(state.externallyManaged).toBe(true)
  })

  it('reports unknown rather than a version it cannot vouch for', async () => {
    const state = await stateOf(provisioned, { readHarnessStates: wired(true) })
    expect(state.status).toBe('unknown')
    expect(state.detail).toContain('outside Muster')
  })

  it('is not externally managed once the managed binary is there', async () => {
    const state = await stateOf(provisioned, {
      readHarnessStates: wired(true),
      probeBinary: foundAt('/usr/bin/acme-mcp', '1.0.0')
    })
    expect(state.externallyManaged).toBeUndefined()
    expect(state.status).toBe('current')
  })

  it('is not externally managed when nothing is wired either', async () => {
    const state = await stateOf(provisioned, { readHarnessStates: wired(false) })
    expect(state.installed).toBe(false)
    expect(state.externallyManaged).toBeUndefined()
  })
})

describe('visibleExtensionHarnesses', () => {
  const row = (
    id: string,
    present: boolean,
    configured = false
  ): ExtensionHarnessState => ({
    id: id as ExtensionHarnessState['id'],
    label: id,
    configPath: `/home/dev/.${id}`,
    present,
    configured,
    current: false
  })

  it('hides an agent this machine does not have', () => {
    const visible = visibleExtensionHarnesses([row('claude-code', true), row('grok', false)])
    expect(visible.map((harness) => harness.id)).toEqual(['claude-code'])
  })

  it('still shows an absent agent that somehow has an entry, so it can be removed', () => {
    const visible = visibleExtensionHarnesses([row('pi', false, true)])
    expect(visible).toHaveLength(1)
  })

  it('keeps every agent when they are all installed', () => {
    const visible = visibleExtensionHarnesses([row('omp', true), row('pi', true)])
    expect(visible).toHaveLength(2)
  })
})
