import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ACTIVECOLLAB_MCP_AGENTS,
  createDefaultActiveCollabMcpEnv,
  findActiveCollabMcpAgent,
  type ActiveCollabMcpAgentAdapter,
  type ActiveCollabMcpEnv
} from './mcp-agents'
import { createNodeActiveCollabMcpFs } from './mcp-config-io'
import { isPlainJsonObject } from '../sites/mcp/site-mcp-jsonrpc'

const BINARY = '/Users/tester/.local/bin/activecollab-mcp'

let home = ''
let env: ActiveCollabMcpEnv

/**
 * The real fs against an injected temp HOME: mode bits and byte-level formatting are what these
 * adapters are judged on, so an in-memory double would prove less than the thing it replaces.
 */
function createEnv(): ActiveCollabMcpEnv {
  return {
    homeDir: home,
    pathEntries: [],
    executableNames: ['activecollab-mcp'],
    fs: createNodeActiveCollabMcpFs()
  }
}

function write(relativePath: string, contents: string): string {
  const target = join(home, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, contents, 'utf8')
  return target
}

function read(relativePath: string): string {
  return readFileSync(join(home, relativePath), 'utf8')
}

function readJson(relativePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(read(relativePath))
  if (!isPlainJsonObject(parsed)) {
    throw new Error(`${relativePath} is not a JSON object`)
  }
  return parsed
}

function readServers(relativePath: string): Record<string, unknown> {
  const servers = readJson(relativePath).mcpServers
  if (!isPlainJsonObject(servers)) {
    throw new Error(`${relativePath} has no mcpServers object`)
  }
  return servers
}

function agent(id: 'claude-code' | 'codex' | 'cursor'): ActiveCollabMcpAgentAdapter {
  return findActiveCollabMcpAgent(id)
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'muster-ac-mcp-agents-'))
  env = createEnv()
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('ActiveCollab MCP agent config paths', () => {
  it('keeps every write inside the injected home, never the real one', () => {
    const real = homedir()
    for (const adapter of ACTIVECOLLAB_MCP_AGENTS) {
      expect(adapter.configPath(env).startsWith(`${home}/`)).toBe(true)
      expect(adapter.configPath(env).startsWith(`${real}/`)).toBe(false)
    }
  })

  it('resolves the documented per-agent locations', () => {
    expect(agent('claude-code').configPath(env)).toBe(join(home, '.claude.json'))
    expect(agent('codex').configPath(env)).toBe(join(home, '.codex', 'config.toml'))
    expect(agent('cursor').configPath(env)).toBe(join(home, '.cursor', 'mcp.json'))
  })

  it('marks only Cursor as needing a running server', () => {
    expect(agent('claude-code').requiresRunningServer).toBe(false)
    expect(agent('codex').requiresRunningServer).toBe(false)
    expect(agent('cursor').requiresRunningServer).toBe(true)
  })

  it('rejects an unknown agent id', () => {
    // @ts-expect-error -- the runtime guard is the boundary the IPC layer leans on.
    expect(() => findActiveCollabMcpAgent('vscode')).toThrow(/Unknown MCP agent id/)
  })

  it('reports the default env as the real home so production writes are not redirected', () => {
    expect(createDefaultActiveCollabMcpEnv().homeDir).toBe(homedir())
  })
})

describe('Claude Code adapter', () => {
  it('reports absent when the agent has left no trace', () => {
    expect(agent('claude-code').detect(env, BINARY)).toEqual({
      present: false,
      configured: false,
      current: false
    })
  })

  it('reports present but unconfigured when only other servers exist', () => {
    write('.claude.json', JSON.stringify({ mcpServers: { context7: { command: 'npx' } } }))

    expect(agent('claude-code').detect(env, BINARY)).toEqual({
      present: true,
      configured: false,
      current: false
    })
  })

  it('counts a bare ~/.claude directory as the agent being installed', () => {
    mkdirSync(join(home, '.claude'), { recursive: true })

    expect(agent('claude-code').detect(env, BINARY).present).toBe(true)
  })

  it('reports already-configured and current after an install', () => {
    agent('claude-code').install(env, BINARY)

    expect(agent('claude-code').detect(env, BINARY)).toEqual({
      present: true,
      configured: true,
      current: true
    })
  })

  it('reports a hand-edited entry as stale so the next install repairs it', () => {
    write(
      '.claude.json',
      JSON.stringify({ mcpServers: { activecollab: { command: 'activecollab-mcp' } } })
    )

    expect(agent('claude-code').detect(env, BINARY)).toMatchObject({
      configured: true,
      current: false
    })
  })

  it('preserves other MCP servers and unrelated top-level keys', () => {
    write(
      '.claude.json',
      `${JSON.stringify(
        {
          numStartups: 879,
          mcpServers: {
            context7: { command: 'npx', args: ['-y', 'ctx'] },
            ocsites: { type: 'stdio', command: 'ocsites-mcp', args: ['--stdio'] }
          },
          tipsHistory: { keep: true }
        },
        null,
        2
      )}\n`
    )

    agent('claude-code').install(env, BINARY)

    expect(readJson('.claude.json')).toMatchObject({
      numStartups: 879,
      tipsHistory: { keep: true },
      mcpServers: {
        context7: { command: 'npx', args: ['-y', 'ctx'] },
        ocsites: { type: 'stdio', command: 'ocsites-mcp', args: ['--stdio'] },
        activecollab: { type: 'stdio', command: 'activecollab-mcp', args: ['--stdio'], env: {} }
      }
    })
  })

  it('writes the shape Claude Code actually reads, resolved from PATH', () => {
    agent('claude-code').install(env, BINARY)

    expect(readServers('.claude.json').activecollab).toEqual({
      type: 'stdio',
      command: 'activecollab-mcp',
      args: ['--stdio'],
      env: {}
    })
  })

  it('is idempotent across repeated installs', () => {
    write('.claude.json', JSON.stringify({ mcpServers: { context7: { command: 'npx' } } }))
    agent('claude-code').install(env, BINARY)
    const first = read('.claude.json')

    agent('claude-code').install(env, BINARY)

    expect(read('.claude.json')).toBe(first)
  })

  it('removes only our key on uninstall', () => {
    write(
      '.claude.json',
      JSON.stringify({ keepMe: 1, mcpServers: { context7: { command: 'npx' } } })
    )
    agent('claude-code').install(env, BINARY)

    agent('claude-code').uninstall(env)

    expect(Object.keys(readServers('.claude.json'))).toEqual(['context7'])
    expect(readJson('.claude.json').keepMe).toBe(1)
  })

  it('leaves an unparseable config alone and reports why', () => {
    const target = write('.claude.json', '{ not json ')

    expect(agent('claude-code').detect(env, BINARY)).toMatchObject({
      present: true,
      configured: false,
      error: expect.stringContaining('not valid JSON')
    })
    expect(() => agent('claude-code').install(env, BINARY)).toThrow(/not valid JSON/)
    expect(readFileSync(target, 'utf8')).toBe('{ not json ')
  })

  it('refuses a config whose mcpServers is not an object', () => {
    write('.claude.json', JSON.stringify({ mcpServers: [] }))

    expect(agent('claude-code').detect(env, BINARY)).toMatchObject({
      configured: false,
      error: expect.stringContaining('non-object "mcpServers"')
    })
    expect(() => agent('claude-code').install(env, BINARY)).toThrow(/non-object "mcpServers"/)
  })

  it('treats a half-written empty config as configurable rather than corrupt', () => {
    write('.claude.json', '')

    agent('claude-code').install(env, BINARY)

    expect(readJson('.claude.json')).toEqual({
      mcpServers: {
        activecollab: { type: 'stdio', command: 'activecollab-mcp', args: ['--stdio'], env: {} }
      }
    })
  })

  it('refuses to point the agent at a binary that is not installed', () => {
    expect(() => agent('claude-code').install(env, null)).toThrow(/was not found/)
    expect(existsSync(join(home, '.claude.json'))).toBe(false)
  })
})

describe('Codex adapter', () => {
  const UNRELATED_CONFIG = [
    'model = "gpt-5.5"',
    '',
    '[features]',
    'hooks = true',
    '',
    '[mcp_servers.ocsites]',
    'command = "/Users/tester/.local/bin/ocsites-mcp"',
    'args = ["--stdio"]',
    '',
    '[projects."/repo"]',
    'trust_level = "trusted"',
    ''
  ].join('\n')

  it('reports absent until ~/.codex exists', () => {
    expect(agent('codex').detect(env, BINARY).present).toBe(false)

    mkdirSync(join(home, '.codex'), { recursive: true })

    expect(agent('codex').detect(env, BINARY)).toEqual({
      present: true,
      configured: false,
      current: false
    })
  })

  it('leaves every unrelated table intact', () => {
    write('.codex/config.toml', UNRELATED_CONFIG)

    agent('codex').install(env, BINARY)

    const written = read('.codex/config.toml')
    expect(written).toContain('model = "gpt-5.5"')
    expect(written).toContain('[features]\nhooks = true')
    expect(written).toContain(
      '[mcp_servers.ocsites]\ncommand = "/Users/tester/.local/bin/ocsites-mcp"\nargs = ["--stdio"]'
    )
    expect(written).toContain('[projects."/repo"]\ntrust_level = "trusted"')
    expect(written).toContain(
      `[mcp_servers.activecollab]\ncommand = "${BINARY}"\nargs = ["--stdio"]`
    )
  })

  it('configures the absolute path, because Codex does not search PATH', () => {
    write('.codex/config.toml', UNRELATED_CONFIG)

    agent('codex').install(env, BINARY)

    expect(read('.codex/config.toml')).toContain(`command = "${BINARY}"`)
    expect(agent('codex').detect(env, BINARY)).toEqual({
      present: true,
      configured: true,
      current: true
    })
  })

  it('reports an entry pointing at another path as stale', () => {
    write('.codex/config.toml', UNRELATED_CONFIG)
    agent('codex').install(env, '/opt/old/activecollab-mcp')

    expect(agent('codex').detect(env, BINARY)).toMatchObject({ configured: true, current: false })
  })

  it('rewrites a stale command in place instead of adding a second table', () => {
    write(
      '.codex/config.toml',
      [
        '[mcp_servers.activecollab]',
        'command = "/opt/old/activecollab-mcp"',
        'args = ["--stdio"]',
        '',
        '[mcp_servers.ocsites]',
        'command = "/usr/bin/ocsites-mcp"',
        ''
      ].join('\n')
    )

    agent('codex').install(env, BINARY)

    const written = read('.codex/config.toml')
    expect(written.match(/\[mcp_servers\.activecollab\]/g)).toHaveLength(1)
    expect(written).not.toContain('/opt/old/activecollab-mcp')
    expect(written).toContain('[mcp_servers.ocsites]\ncommand = "/usr/bin/ocsites-mcp"')
  })

  it('is idempotent across repeated installs', () => {
    write('.codex/config.toml', UNRELATED_CONFIG)
    agent('codex').install(env, BINARY)
    const first = read('.codex/config.toml')

    agent('codex').install(env, BINARY)

    expect(read('.codex/config.toml')).toBe(first)
  })

  it('creates the config when Codex has none yet', () => {
    agent('codex').install(env, BINARY)

    expect(read('.codex/config.toml')).toBe(
      `[mcp_servers.activecollab]\ncommand = "${BINARY}"\nargs = ["--stdio"]\n`
    )
  })

  it('escapes a path containing TOML string metacharacters', () => {
    const awkward = '/Users/te"st\\bin/activecollab-mcp'

    agent('codex').install(env, awkward)

    expect(read('.codex/config.toml')).toContain(
      'command = "/Users/te\\"st\\\\bin/activecollab-mcp"'
    )
    expect(agent('codex').detect(env, awkward).current).toBe(true)
  })

  it('removes only our table on uninstall', () => {
    write('.codex/config.toml', UNRELATED_CONFIG)
    agent('codex').install(env, BINARY)

    agent('codex').uninstall(env)

    const written = read('.codex/config.toml')
    expect(written).not.toContain('activecollab')
    expect(written).toContain('[mcp_servers.ocsites]')
    expect(written).toContain('[projects."/repo"]\ntrust_level = "trusted"')
    expect(written).toContain('model = "gpt-5.5"')
  })

  it('refuses to write a command Codex could never spawn', () => {
    expect(() => agent('codex').install(env, null)).toThrow(/was not found/)
    expect(existsSync(join(home, '.codex', 'config.toml'))).toBe(false)
  })

  it('keeps CRLF line endings when the config uses them', () => {
    write(
      '.codex/config.toml',
      ['model = "gpt-5.5"', '', '[mcp_servers.ocsites]', 'command = "x"', ''].join('\r\n')
    )

    agent('codex').install(env, BINARY)

    const written = read('.codex/config.toml')
    expect(written).not.toMatch(/[^\r]\n/)
    expect(written).toContain(`[mcp_servers.activecollab]\r\ncommand = "${BINARY}"`)
    expect(written).toContain('[mcp_servers.ocsites]\r\ncommand = "x"')
    expect(agent('codex').detect(env, BINARY).current).toBe(true)
  })
})

describe('Cursor adapter', () => {
  it('reports present from the ~/.cursor directory alone', () => {
    mkdirSync(join(home, '.cursor'), { recursive: true })

    expect(agent('cursor').detect(env, BINARY)).toEqual({
      present: true,
      configured: false,
      current: false
    })
  })

  it('writes the loopback HTTP endpoint without needing a local binary', () => {
    agent('cursor').install(env, null)

    expect(readJson('.cursor/mcp.json')).toEqual({
      mcpServers: { activecollab: { url: 'http://127.0.0.1:8787/mcp' } }
    })
    expect(agent('cursor').detect(env, null).current).toBe(true)
  })

  it('preserves other HTTP servers', () => {
    write(
      '.cursor/mcp.json',
      JSON.stringify({
        mcpServers: {
          ocsites: { url: 'http://127.0.0.1:8765/mcp' },
          'Figma Desktop': { url: 'http://127.0.0.1:3845/mcp', headers: {} }
        }
      })
    )

    agent('cursor').install(env, BINARY)

    const servers = readServers('.cursor/mcp.json')
    expect(Object.keys(servers)).toEqual(['ocsites', 'Figma Desktop', 'activecollab'])
    expect(servers['Figma Desktop']).toEqual({ url: 'http://127.0.0.1:3845/mcp', headers: {} })
  })

  it('removes only our key on uninstall', () => {
    write('.cursor/mcp.json', JSON.stringify({ mcpServers: { ocsites: { url: 'http://x/mcp' } } }))
    agent('cursor').install(env, BINARY)

    agent('cursor').uninstall(env)

    expect(readJson('.cursor/mcp.json')).toEqual({
      mcpServers: { ocsites: { url: 'http://x/mcp' } }
    })
  })
})
