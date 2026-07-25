import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteResult } from '../../shared/site-types'
import type { Store } from '../persistence'
import { isPlainJsonObject } from '../sites/mcp/site-mcp-jsonrpc'

const { handlers, removed } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, args?: unknown) => unknown>(),
  removed: [] as string[]
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getAppPath: () => '/Applications/Muster.app/Contents/Resources/app.asar',
    getVersion: () => '1.2.3'
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      removed.push(channel)
    })
  }
}))

import { registerSiteMcpHandlers, type SiteMcpStatus, type SiteMcpWriteResult } from './site-mcp'

function invoke<T>(channel: string, args?: unknown): SiteResult<T> {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`channel ${channel} was never registered`)
  }
  return handler({}, args) as SiteResult<T>
}

function unwrap<T>(result: SiteResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got: ${result.error}`)
  }
  return result.value
}

function readJson(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isPlainJsonObject(parsed)) {
    throw new Error(`${path} is not a JSON object`)
  }
  return parsed
}

function readServerNames(path: string): string[] {
  const servers = readJson(path).mcpServers
  if (!isPlainJsonObject(servers)) {
    throw new Error(`${path} has no mcpServers object`)
  }
  return Object.keys(servers)
}

let root = ''

// Auto-registration walks the store's sites; an empty list keeps these tests about the IPC seam.
const emptyStore = { listSites: () => [] } as unknown as Store

beforeEach(() => {
  handlers.clear()
  removed.length = 0
  root = mkdtempSync(join(tmpdir(), 'muster-mcp-'))
  registerSiteMcpHandlers(emptyStore)
})

describe('siteMcp:status', () => {
  it('removes its handlers before registering, so a re-register cannot double up', () => {
    expect(removed).toEqual(['siteMcp:status', 'siteMcp:register', 'siteMcp:unregister'])
  })

  it('lists every tool and the command agents should spawn', () => {
    const status = unwrap(invoke<SiteMcpStatus>('siteMcp:status', {}))
    expect(status.serverName).toBe('muster-sites')
    expect(status.command.args).toEqual(['--site-mcp'])
    expect(status.command.command.length).toBeGreaterThan(0)
    expect(status.tools.map((tool) => tool.name)).toContain('run_deploy_functions')
    expect(status.tools).toHaveLength(24)
    expect(status.targets).toEqual([])
  })

  it('reports every known config location for a project', () => {
    const status = unwrap(invoke<SiteMcpStatus>('siteMcp:status', { rootPath: root }))
    expect(status.targets.map((target) => target.relativePath)).toEqual([
      '.mcp.json',
      '.cursor/mcp.json',
      '.claude.json',
      '.claude/mcp.json'
    ])
    expect(status.targets.every((target) => !target.exists && !target.registered)).toBe(true)
  })
})

describe('siteMcp:register', () => {
  it('creates the workspace config and reports the entry as current', () => {
    const written = unwrap(invoke<SiteMcpWriteResult>('siteMcp:register', { rootPath: root }))
    expect(written.configPath).toBe(join(root, '.mcp.json'))

    const document = readJson(written.configPath)
    expect(document).toHaveProperty('mcpServers.muster-sites.args', ['--site-mcp'])

    const target = written.targets.find((entry) => entry.relativePath === '.mcp.json')
    expect(target).toMatchObject({ exists: true, registered: true, current: true })
  })

  it('leaves every other MCP server in the file untouched', () => {
    const configPath = join(root, '.mcp.json')
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: { context7: { command: 'npx', args: ['-y', 'ctx'] } },
        someOtherKey: { keep: true }
      }),
      'utf8'
    )
    invoke('siteMcp:register', { rootPath: root })

    const document = readJson(configPath)
    expect(document).toHaveProperty('mcpServers.context7.command', 'npx')
    expect(document).toHaveProperty('someOtherKey.keep', true)
    expect(document).toHaveProperty('mcpServers.muster-sites')
  })

  it('rewrites a stale command in place instead of adding a duplicate', () => {
    const configPath = join(root, '.mcp.json')
    writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { 'muster-sites': { command: '/old/Muster', args: [] } } }),
      'utf8'
    )
    const before = unwrap(invoke<SiteMcpStatus>('siteMcp:status', { rootPath: root }))
    expect(before.targets[0]).toMatchObject({ registered: true, current: false })

    invoke('siteMcp:register', { rootPath: root })
    const after = unwrap(invoke<SiteMcpStatus>('siteMcp:status', { rootPath: root }))
    expect(after.targets[0]).toMatchObject({ registered: true, current: true })
    expect(readServerNames(configPath)).toEqual(['muster-sites'])
  })

  it('creates the parent directory for a nested config path', () => {
    const written = unwrap(
      invoke<SiteMcpWriteResult>('siteMcp:register', {
        rootPath: root,
        configPath: '.cursor/mcp.json'
      })
    )
    expect(written.configPath).toBe(join(root, '.cursor', 'mcp.json'))
    expect(readJson(written.configPath)).toHaveProperty('mcpServers.muster-sites')
  })

  it('refuses an unparseable config rather than replacing it', () => {
    const configPath = join(root, '.mcp.json')
    writeFileSync(configPath, '{ not json', 'utf8')
    const result = invoke('siteMcp:register', { rootPath: root })
    expect(result.ok).toBe(false)
    expect(readFileSync(configPath, 'utf8')).toBe('{ not json')
  })

  it('refuses a relative project path', () => {
    const result = invoke('siteMcp:register', { rootPath: 'relative/project' })
    expect(result).toEqual({ ok: false, error: 'An absolute project path is required.' })
  })

  it('refuses a config path outside the known candidates', () => {
    const result = invoke('siteMcp:register', { rootPath: root, configPath: '../../etc/passwd' })
    expect(result.ok).toBe(false)
  })

  it('returns a failure instead of throwing when args are missing', () => {
    expect(invoke('siteMcp:register', {}).ok).toBe(false)
    expect(invoke('siteMcp:register', undefined).ok).toBe(false)
  })
})

describe('siteMcp:unregister', () => {
  it('removes only the muster-sites entry', () => {
    const configPath = join(root, '.mcp.json')
    writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { context7: { command: 'npx' } } }),
      'utf8'
    )
    invoke('siteMcp:register', { rootPath: root })

    const written = unwrap(invoke<SiteMcpWriteResult>('siteMcp:unregister', { rootPath: root }))
    expect(readServerNames(written.configPath)).toEqual(['context7'])
    expect(written.targets[0]).toMatchObject({ exists: true, registered: false })
  })

  it('is a no-op when the config does not exist', () => {
    const written = unwrap(invoke<SiteMcpWriteResult>('siteMcp:unregister', { rootPath: root }))
    expect(written.targets.every((target) => !target.exists)).toBe(true)
  })

  it('reports a config it cannot parse without touching it', () => {
    const nested = join(root, '.claude')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(nested, 'mcp.json'), 'nope', 'utf8')
    const status = unwrap(invoke<SiteMcpStatus>('siteMcp:status', { rootPath: root }))
    const target = status.targets.find((entry) => entry.relativePath === '.claude/mcp.json')
    expect(target).toMatchObject({ exists: true, registered: false })
    expect(typeof target?.error).toBe('string')
  })
})
