import { describe, expect, it } from 'vitest'
import type { ActiveCollabMcpFs } from '../activecollab/mcp-config-io'
import type { ExtensionMcpServerSpec } from '../../shared/extension-catalog-types'
import {
  installExtensionMcpHarness,
  MISSING_BINARY_MESSAGE,
  readExtensionMcpHarnessStates,
  uninstallExtensionMcpHarness,
  type ExtensionMcpEnv
} from './mcp-entry-adapters'

function createEnv(seed: Record<string, string> = {}): ExtensionMcpEnv & { files: Map<string, string> } {
  const files = new Map(Object.entries(seed))
  const fs: ActiveCollabMcpFs = {
    exists: (target) => files.has(target),
    isExecutableFile: () => false,
    readText: (target) => files.get(target) ?? null,
    writeText: (target, contents) => {
      files.set(target, contents)
    },
    writeSecretText: (target, contents) => {
      files.set(target, contents)
    }
  }
  return { homeDir: '/home/dev', fs, files }
}

const server: ExtensionMcpServerSpec = {
  key: 'acme',
  harnesses: [
    {
      id: 'claude-code',
      transport: { kind: 'stdio', binary: 'acme-mcp', args: ['--stdio'], env: {} }
    },
    { id: 'codex', transport: { kind: 'stdio', binary: 'acme-mcp', args: ['--stdio'], env: {} } },
    { id: 'cursor', transport: { kind: 'http', url: 'http://127.0.0.1:9999/mcp' } },
    { id: 'grok', transport: { kind: 'stdio', binary: 'acme-mcp', args: ['--stdio'], env: {} } },
    { id: 'omp', transport: { kind: 'stdio', binary: 'acme-mcp', args: ['--stdio'], env: {} } },
    { id: 'pi', transport: { kind: 'stdio', binary: 'acme-mcp', args: ['--stdio'], env: {} } }
  ]
}

function stateFor(
  id: string,
  env: ExtensionMcpEnv
): ReturnType<typeof readExtensionMcpHarnessStates>[number] {
  const found = readExtensionMcpHarnessStates(server, '/usr/bin/acme-mcp', env).find(
    (state) => state.id === id
  )
  if (!found) {
    throw new Error(`no state for ${id}`)
  }
  return found
}

describe('readExtensionMcpHarnessStates', () => {
  it('reports an unconfigured harness that is nonetheless present', () => {
    const env = createEnv({ '/home/dev/.claude.json': '{}' })
    const [claude] = readExtensionMcpHarnessStates(server, '/usr/bin/acme-mcp', env)
    expect(claude).toMatchObject({ present: true, configured: false, current: false })
  })

  it('reads a matching Claude Code entry as current', () => {
    const env = createEnv({
      '/home/dev/.claude.json': JSON.stringify({
        mcpServers: {
          acme: { type: 'stdio', command: 'acme-mcp', args: ['--stdio'], env: {} }
        }
      })
    })
    const [claude] = readExtensionMcpHarnessStates(server, '/usr/bin/acme-mcp', env)
    expect(claude).toMatchObject({ configured: true, current: true })
  })

  it('reads a hand-edited entry as stale so it gets rewritten', () => {
    const env = createEnv({
      '/home/dev/.claude.json': JSON.stringify({
        mcpServers: { acme: { type: 'stdio', command: 'acme-mcp', args: [], env: {} } }
      })
    })
    const [claude] = readExtensionMcpHarnessStates(server, '/usr/bin/acme-mcp', env)
    expect(claude).toMatchObject({ configured: true, current: false })
  })

  it('never reads a stdio entry as current while the binary is missing', () => {
    const env = createEnv({
      '/home/dev/.claude.json': JSON.stringify({
        mcpServers: {
          acme: { type: 'stdio', command: 'acme-mcp', args: ['--stdio'], env: {} }
        }
      })
    })
    const [claude] = readExtensionMcpHarnessStates(server, null, env)
    expect(claude.current).toBe(false)
  })

  it('reads an http harness as current without any binary at all', () => {
    const env = createEnv({
      '/home/dev/.cursor/mcp.json': JSON.stringify({
        mcpServers: { acme: { url: 'http://127.0.0.1:9999/mcp' } }
      })
    })
    const states = readExtensionMcpHarnessStates(server, null, env)
    expect(states.find((state) => state.id === 'cursor')).toMatchObject({ current: true })
  })

  it('reads a Codex table that matches as current', () => {
    const env = createEnv({
      '/home/dev/.codex/config.toml': [
        '[mcp_servers.acme]',
        'command = "/usr/bin/acme-mcp"',
        'args = ["--stdio"]'
      ].join('\n')
    })
    const states = readExtensionMcpHarnessStates(server, '/usr/bin/acme-mcp', env)
    expect(states.find((state) => state.id === 'codex')).toMatchObject({ current: true })
  })

  it('reads a Codex table with a line too many as stale', () => {
    // The case that mattered: clearing an API key removes the whole `env` line, so a check that
    // only looked for the lines it expected called this current and left the old value behind.
    const env = createEnv({
      '/home/dev/.codex/config.toml': [
        '[mcp_servers.acme]',
        'command = "/usr/bin/acme-mcp"',
        'args = ["--stdio"]',
        'env = { ACME_TOKEN = "stale" }'
      ].join('\n')
    })
    const states = readExtensionMcpHarnessStates(server, '/usr/bin/acme-mcp', env)
    expect(states.find((state) => state.id === 'codex')).toMatchObject({
      configured: true,
      current: false
    })
  })

  it('surfaces an unparseable config as an error instead of overwriting it', () => {
    const env = createEnv({ '/home/dev/.claude.json': '{ broken' })
    const [claude] = readExtensionMcpHarnessStates(server, '/usr/bin/acme-mcp', env)
    expect(claude.error).toBeTruthy()
    expect(claude.configured).toBe(false)
  })
})

describe('the agents beyond the first three', () => {
  it('writes OMP into its own agent config, with an absolute command', () => {
    const env = createEnv()
    const path = installExtensionMcpHarness(server, 'omp', '/usr/bin/acme-mcp', env)
    expect(path).toBe('/home/dev/.omp/agent/mcp.json')
    const written = JSON.parse(env.files.get(path) ?? '{}')
    expect(written.mcpServers.acme).toMatchObject({ command: '/usr/bin/acme-mcp' })
  })

  it('writes PI one directory across, in the same shape', () => {
    const env = createEnv()
    const path = installExtensionMcpHarness(server, 'pi', '/usr/bin/acme-mcp', env)
    expect(path).toBe('/home/dev/.pi/agent/mcp.json')
    expect(JSON.parse(env.files.get(path) ?? '{}').mcpServers.acme.command).toBe(
      '/usr/bin/acme-mcp'
    )
  })

  it("writes Grok's enabled flag, because its own mcp add does", () => {
    const env = createEnv()
    const path = installExtensionMcpHarness(server, 'grok', '/usr/bin/acme-mcp', env)
    expect(path).toBe('/home/dev/.grok/config.toml')
    const written = env.files.get(path) ?? ''
    expect(written).toContain('[mcp_servers.acme]')
    expect(written).toContain('enabled = true')
  })

  it('reads a Grok table Muster wrote as current', () => {
    const env = createEnv()
    installExtensionMcpHarness(server, 'grok', '/usr/bin/acme-mcp', env)
    expect(stateFor('grok', env)).toMatchObject({ configured: true, current: true })
  })

  it('reads a Grok entry reordered by hand as current, since order carries no meaning', () => {
    const env = createEnv({
      '/home/dev/.grok/config.toml': [
        '[mcp_servers.acme]',
        'enabled = true',
        'args = ["--stdio"]',
        'command = "/usr/bin/acme-mcp"'
      ].join('\n')
    })
    expect(stateFor('grok', env)).toMatchObject({ configured: true, current: true })
  })

  it('reads a Grok entry disabled in Grok as stale, which is what it is', () => {
    const env = createEnv({
      '/home/dev/.grok/config.toml': [
        '[mcp_servers.acme]',
        'command = "/usr/bin/acme-mcp"',
        'args = ["--stdio"]',
        'enabled = false'
      ].join('\n')
    })
    expect(stateFor('grok', env)).toMatchObject({ configured: true, current: false })
  })

  it('reports an agent whose directory is absent as not present', () => {
    const env = createEnv({ '/home/dev/.omp': '' })
    expect(stateFor('omp', env).present).toBe(true)
    expect(stateFor('pi', env).present).toBe(false)
    expect(stateFor('grok', env).present).toBe(false)
  })
})

describe('installExtensionMcpHarness', () => {
  it('writes Claude Code the bare binary name, which it resolves through PATH', () => {
    const env = createEnv()
    installExtensionMcpHarness(server, 'claude-code', '/usr/bin/acme-mcp', env)
    const written = JSON.parse(env.files.get('/home/dev/.claude.json') ?? '{}')
    expect(written.mcpServers.acme.command).toBe('acme-mcp')
  })

  it('writes Codex the absolute path, because Codex does not search PATH', () => {
    const env = createEnv()
    installExtensionMcpHarness(server, 'codex', '/usr/bin/acme-mcp', env)
    expect(env.files.get('/home/dev/.codex/config.toml')).toContain(
      'command = "/usr/bin/acme-mcp"'
    )
  })

  it('refuses to write a stdio entry that would point at nothing', () => {
    const env = createEnv()
    expect(() => installExtensionMcpHarness(server, 'claude-code', null, env)).toThrow(
      MISSING_BINARY_MESSAGE
    )
  })

  it('writes an http entry with no binary installed', () => {
    const env = createEnv()
    installExtensionMcpHarness(server, 'cursor', null, env)
    const written = JSON.parse(env.files.get('/home/dev/.cursor/mcp.json') ?? '{}')
    expect(written.mcpServers.acme.url).toBe('http://127.0.0.1:9999/mcp')
  })

  it('leaves a neighbouring server untouched', () => {
    const env = createEnv({
      '/home/dev/.claude.json': JSON.stringify({
        mcpServers: { other: { command: 'other-mcp' } }
      })
    })
    installExtensionMcpHarness(server, 'claude-code', '/usr/bin/acme-mcp', env)
    const written = JSON.parse(env.files.get('/home/dev/.claude.json') ?? '{}')
    expect(written.mcpServers.other.command).toBe('other-mcp')
    expect(written.mcpServers.acme).toBeTruthy()
  })

  it('rejects a harness the entry does not declare', () => {
    const env = createEnv()
    const claudeOnly: ExtensionMcpServerSpec = { key: 'acme', harnesses: [server.harnesses[0]] }
    expect(() => installExtensionMcpHarness(claudeOnly, 'codex', '/usr/bin/acme-mcp', env)).toThrow()
  })

  it('round-trips an install and uninstall', () => {
    const env = createEnv()
    installExtensionMcpHarness(server, 'claude-code', '/usr/bin/acme-mcp', env)
    uninstallExtensionMcpHarness(server, 'claude-code', env)
    const written = JSON.parse(env.files.get('/home/dev/.claude.json') ?? '{}')
    expect(written.mcpServers?.acme).toBeUndefined()
  })
})
