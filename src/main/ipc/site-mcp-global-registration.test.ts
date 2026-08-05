import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNodeActiveCollabMcpFs } from '../activecollab/mcp-config-io'
import { isPlainJsonObject } from '../sites/mcp/site-mcp-jsonrpc'
import {
  installSiteMcpHarness,
  readSiteMcpHarnessStatuses,
  SITE_MCP_HARNESSES,
  type SiteMcpGlobalEnv
} from './site-mcp-global-registration'
import type { SiteMcpCommand, SiteMcpHarnessId } from '../../shared/site-mcp-types'

// The packaged shape resolveSiteMcpCommand produces; injected so nothing here touches electron.
const COMMAND: SiteMcpCommand = {
  command: '/Applications/Muster.app/Contents/MacOS/Muster',
  args: [
    '/Applications/Muster.app/Contents/Resources/app.asar.unpacked/out/main/site-mcp-shim.js',
    '--site-mcp'
  ],
  env: { ELECTRON_RUN_AS_NODE: '1' }
}

let home = ''
let env: SiteMcpGlobalEnv

/**
 * The real fs against an injected temp HOME, mirroring mcp-agents.test.ts: byte-level formatting
 * is what these writers are judged on, so an in-memory double would prove less than what it
 * replaces.
 */
function write(relativePath: string, contents: string): string {
  const target = join(home, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, contents, 'utf8')
  return target
}

function read(relativePath: string): string {
  return readFileSync(join(home, relativePath), 'utf8')
}

function readServers(relativePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(read(relativePath))
  if (!isPlainJsonObject(parsed) || !isPlainJsonObject(parsed.mcpServers)) {
    throw new Error(`${relativePath} has no mcpServers object`)
  }
  return parsed.mcpServers
}

function statusOf(id: SiteMcpHarnessId, command: SiteMcpCommand = COMMAND) {
  const status = readSiteMcpHarnessStatuses(command, env).find((entry) => entry.id === id)
  if (!status) {
    throw new Error(`no status for ${id}`)
  }
  return status
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'muster-site-mcp-global-'))
  env = { homeDir: home, fs: createNodeActiveCollabMcpFs() }
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('site MCP harness config paths', () => {
  it('keeps every write inside the injected home, never the real one', () => {
    const real = homedir()
    for (const harness of SITE_MCP_HARNESSES) {
      expect(harness.configPath(env).startsWith(`${home}/`)).toBe(true)
      expect(harness.configPath(env).startsWith(`${real}/`)).toBe(false)
    }
  })

  it('resolves the documented per-harness locations', () => {
    expect(statusOf('claude-code').configPath).toBe(join(home, '.claude.json'))
    expect(statusOf('codex').configPath).toBe(join(home, '.codex', 'config.toml'))
    expect(statusOf('cursor').configPath).toBe(join(home, '.cursor', 'mcp.json'))
  })

  it('rejects an unknown harness id', () => {
    // @ts-expect-error -- the runtime guard is the boundary the IPC layer leans on.
    expect(() => installSiteMcpHarness('vscode', COMMAND, env)).toThrow(/Unknown MCP harness id/)
  })
})

describe('Claude Code harness', () => {
  it('reports absent and unconfigured when the harness has left no trace', () => {
    const status = statusOf('claude-code')
    expect(status).toMatchObject({ present: false, configured: false, current: false })
  })

  it('splices the entry into an existing config, preserving every other server and sibling key', () => {
    write(
      '.claude.json',
      JSON.stringify(
        {
          theme: 'dark',
          mcpServers: {
            other: { command: 'other-mcp', args: [], env: { ELECTRON_RUN_AS_NODE: '1' } }
          }
        },
        null,
        2
      )
    )
    const configPath = installSiteMcpHarness('claude-code', COMMAND, env)
    expect(configPath).toBe(join(home, '.claude.json'))
    const servers = readServers('.claude.json')
    expect(servers.other).toEqual({
      command: 'other-mcp',
      args: [],
      env: { ELECTRON_RUN_AS_NODE: '1' }
    })
    expect(servers['muster-sites']).toEqual(COMMAND)
    const parsed: unknown = JSON.parse(read('.claude.json'))
    expect(isPlainJsonObject(parsed) && parsed.theme).toBe('dark')
    expect(statusOf('claude-code')).toMatchObject({ configured: true, current: true })
  })

  it('flips to stale when the stored command differs from what this build would write', () => {
    installSiteMcpHarness('claude-code', COMMAND, env)
    const moved = {
      command: '/Applications/Old.app/Contents/MacOS/Muster',
      args: ['--site-mcp'],
      env: { ELECTRON_RUN_AS_NODE: '1' }
    }
    expect(statusOf('claude-code', moved)).toMatchObject({ configured: true, current: false })
    // Re-installing with the new command is the repair path.
    installSiteMcpHarness('claude-code', moved, env)
    expect(statusOf('claude-code', moved)).toMatchObject({ configured: true, current: true })
  })

  it('refuses an unparseable config instead of replacing it', () => {
    const target = write('.claude.json', '{ not json')
    expect(() => installSiteMcpHarness('claude-code', COMMAND, env)).toThrow(/not valid JSON/)
    expect(read('.claude.json')).toBe('{ not json')
    const status = statusOf('claude-code')
    expect(status.configured).toBe(false)
    expect(status.error).toContain(target)
  })
})

describe('Codex harness', () => {
  it('appends its table to an existing config and round-trips as current', () => {
    write(
      '.codex/config.toml',
      ['model = "gpt-5"', '', '[mcp_servers.other]', 'command = "other-mcp"', ''].join('\n')
    )
    installSiteMcpHarness('codex', COMMAND, env)
    const written = read('.codex/config.toml')
    // Unrelated content keeps its bytes; our table lands after it.
    expect(written).toContain('model = "gpt-5"')
    expect(written).toContain('[mcp_servers.other]\ncommand = "other-mcp"')
    expect(written).toContain(
      `[mcp_servers.muster-sites]\ncommand = "${COMMAND.command}"\nargs = ["${COMMAND.args[0]}", "--site-mcp"]\nenv = { ELECTRON_RUN_AS_NODE = "1" }`
    )
    expect(statusOf('codex')).toMatchObject({ present: true, configured: true, current: true })
  })

  it('flips to stale on a command change and repairs in place without duplicating the table', () => {
    installSiteMcpHarness('codex', COMMAND, env)
    // The dev shape carries the app path as an extra argument.
    const dev = {
      command: '/usr/local/bin/electron',
      args: ['/repo/muster-ui', '--site-mcp'],
      env: { ELECTRON_RUN_AS_NODE: '1' }
    }
    expect(statusOf('codex', dev)).toMatchObject({ configured: true, current: false })
    installSiteMcpHarness('codex', dev, env)
    const written = read('.codex/config.toml')
    expect(written.match(/\[mcp_servers\.muster-sites\]/g)).toHaveLength(1)
    expect(written).toContain('args = ["/repo/muster-ui", "--site-mcp"]')
    expect(statusOf('codex', dev)).toMatchObject({ configured: true, current: true })
  })
})

describe('Cursor harness', () => {
  it('writes a stdio entry (the site MCP has no HTTP daemon) and preserves other servers', () => {
    write(
      '.cursor/mcp.json',
      JSON.stringify({ mcpServers: { other: { url: 'http://127.0.0.1:9999/mcp' } } }, null, 2)
    )
    installSiteMcpHarness('cursor', COMMAND, env)
    const servers = readServers('.cursor/mcp.json')
    expect(servers.other).toEqual({ url: 'http://127.0.0.1:9999/mcp' })
    expect(servers['muster-sites']).toEqual(COMMAND)
    expect(statusOf('cursor')).toMatchObject({ present: true, configured: true, current: true })
  })
})
