import { describe, expect, it } from 'vitest'
import {
  createEmptySiteEnvironment,
  resolveSiteEnvironment,
  type Site,
  type SiteSecretPresence,
  type SiteSummary
} from '../../../shared/site-types'
import type { SiteMcpContext } from './site-mcp-context'
import { createLineReader, isPlainJsonObject, parseJsonRpcFrame } from './site-mcp-jsonrpc'
import { createSiteMcpServer, SITE_MCP_DEFAULT_PROTOCOL_VERSION } from './site-mcp-server'
import { SITE_MCP_SERVER_NAME, SITE_MCP_TOOLS } from './site-mcp-tools'

const SSH_SECRET = 'ssh-pw-SENTINEL-must-never-leak'

function siteRecord(): Site {
  const base: Site = {
    id: 'site-1',
    path: '/Sites/acme',
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '8.2',
    activeEnvironment: 'main',
    environments: { main: { ...createEmptySiteEnvironment(), hostname: 'acme.example.com' } },
    notes: '',
    searchReplaceTimeoutSeconds: 600
  }
  return Object.assign(base, { password: SSH_SECRET })
}

function createContext(): SiteMcpContext {
  const records = [siteRecord()]
  const summarize = (site: Site): Promise<SiteSummary> => {
    const secrets: Record<string, SiteSecretPresence> = {}
    for (const name of Object.keys(site.environments)) {
      secrets[name] = { ssh: true, db: false }
    }
    return Promise.resolve({
      site,
      pathExists: true,
      branch: 'main',
      resolvedEnvironment: resolveSiteEnvironment(site, 'main'),
      secrets,
      importSelectedCount: 0,
      deploySelectedCount: 0
    })
  }
  return {
    cwd: '/Sites/acme',
    openSshSession: async () => ({
      exec: async () => ({ code: 0, stdout: 'remote-ok', stderr: '' }),
      download: async () => undefined,
      upload: async () => undefined,
      writeSecureRemoteFile: async () => undefined,
      removeRemoteFile: async () => undefined,
      close: async () => undefined
    }),
    store: {
      listSites: () => records,
      getSite: (siteId) => records.find((site) => site.id === siteId) ?? null,
      findSiteByPath: (sitePath) => records.find((site) => site.path === sitePath) ?? null,
      updateSite: () => null
    },
    summarize,
    summarizeAll: (list) => Promise.all(list.map((site) => summarize(site))),
    hasSshSecret: () => true,
    copyEnvironmentSecrets: () => undefined,
    deleteEnvironmentSecrets: () => undefined,
    gitStatus: () => Promise.resolve(null),
    listRuns: () => [],
    readRunLog: () => ({ run: null, lines: [], truncatedEarlier: 0, firstErrorIndex: -1 }),
    listActiveRuns: () => [],
    startRun: () => {
      throw new Error('not started in this test')
    },
    cancelRun: () => false,
    shutdownRuns: () => Promise.resolve()
  }
}

type Harness = {
  send: (message: unknown) => Promise<Record<string, unknown>[]>
  sendRaw: (raw: string) => Promise<Record<string, unknown>[]>
  /** Feed bytes without waiting, so a frame can be split across calls. */
  push: (raw: string) => void
  frames: Record<string, unknown>[]
}

function createHarness(): Harness {
  const frames: Record<string, unknown>[] = []
  const server = createSiteMcpServer({
    context: createContext(),
    write: (frame) => {
      expect(frame.endsWith('\n'), 'every frame must be newline-terminated').toBe(true)
      const parsed: unknown = JSON.parse(frame)
      if (!isPlainJsonObject(parsed)) {
        throw new Error(`server wrote a non-object frame: ${frame}`)
      }
      frames.push(parsed)
    },
    version: '1.2.3'
  })
  const sendRaw = async (raw: string): Promise<Record<string, unknown>[]> => {
    const before = frames.length
    server.push(raw)
    await server.drain()
    return frames.slice(before)
  }
  return {
    frames,
    sendRaw,
    push: (raw) => server.push(raw),
    send: (message) => sendRaw(`${JSON.stringify(message)}\n`)
  }
}

function request(id: number | string, method: string, params?: unknown): Record<string, unknown> {
  return { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }
}

describe('initialize', () => {
  it('reports the tools capability and identifies the server', async () => {
    const [frame] = await createHarness().send(
      request(1, 'initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'test' } })
    )
    expect(frame).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SITE_MCP_SERVER_NAME, version: '1.2.3' }
      }
    })
  })

  it('negotiates an unrecognised protocol version down to one it implements', async () => {
    const [frame] = await createHarness().send(
      request(1, 'initialize', { protocolVersion: '1999-01-01' })
    )
    expect(frame).toMatchObject({
      result: { protocolVersion: SITE_MCP_DEFAULT_PROTOCOL_VERSION }
    })
  })

  it('never answers a notification', async () => {
    const harness = createHarness()
    const frames = await harness.send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    expect(frames).toEqual([])
  })
})

describe('tools/list', () => {
  it('returns every tool with a valid JSON schema', async () => {
    const [frame] = await createHarness().send(request(2, 'tools/list'))
    const result: unknown = frame?.result
    if (!isPlainJsonObject(result) || !Array.isArray(result.tools)) {
      throw new Error(`tools/list did not return a tools array: ${JSON.stringify(frame)}`)
    }
    expect(result.tools).toHaveLength(SITE_MCP_TOOLS.length)
    for (const entry of result.tools) {
      if (!isPlainJsonObject(entry) || !isPlainJsonObject(entry.inputSchema)) {
        throw new Error(`malformed tool descriptor: ${JSON.stringify(entry)}`)
      }
      expect(typeof entry.name).toBe('string')
      expect(typeof entry.description).toBe('string')
      expect(entry.inputSchema.type).toBe('object')
      expect(entry.inputSchema.additionalProperties).toBe(false)
      expect(isPlainJsonObject(entry.inputSchema.properties)).toBe(true)
      expect(Array.isArray(entry.inputSchema.required)).toBe(true)
      // A descriptor must survive the wire unchanged, or a client rejects the whole list.
      expect(JSON.parse(JSON.stringify(entry))).toEqual(entry)
    }
  })
})

describe('tools/call', () => {
  it('returns a tool payload as JSON text content', async () => {
    const [frame] = await createHarness().send(
      request(3, 'tools/call', { name: 'list_sites', arguments: {} })
    )
    const result: unknown = frame?.result
    if (!isPlainJsonObject(result) || !Array.isArray(result.content)) {
      throw new Error(`tools/call returned no content: ${JSON.stringify(frame)}`)
    }
    expect(result.isError).toBeUndefined()
    const [entry] = result.content
    if (!isPlainJsonObject(entry) || typeof entry.text !== 'string') {
      throw new Error('tool content is not a text block')
    }
    expect(entry.type).toBe('text')
    expect(entry.text).not.toContain(SSH_SECRET)
    expect(JSON.parse(entry.text)).toMatchObject({ ok: true, count: 1 })
  })

  it('defaults missing arguments to an empty object', async () => {
    const [frame] = await createHarness().send(request(4, 'tools/call', { name: 'list_sites' }))
    expect(frame).toHaveProperty('result')
    expect(frame).not.toHaveProperty('error')
  })

  it('reports a failing tool as isError rather than a protocol error', async () => {
    const [frame] = await createHarness().send(
      request(5, 'tools/call', { name: 'get_deployment_status', arguments: { site: 'ghost' } })
    )
    const result: unknown = frame?.result
    if (!isPlainJsonObject(result)) {
      throw new Error(`expected a result, got ${JSON.stringify(frame)}`)
    }
    expect(result.isError).toBe(true)
    expect(frame).not.toHaveProperty('error')
  })

  it('rejects an unknown tool with invalid-params and lists what exists', async () => {
    const [frame] = await createHarness().send(
      request(6, 'tools/call', { name: 'drop_database', arguments: {} })
    )
    const error: unknown = frame?.error
    if (!isPlainJsonObject(error)) {
      throw new Error(`expected an error, got ${JSON.stringify(frame)}`)
    }
    expect(frame.id).toBe(6)
    expect(error.code).toBe(-32602)
    expect(String(error.message)).toContain('drop_database')
    if (!isPlainJsonObject(error.data) || !Array.isArray(error.data.available_tools)) {
      throw new Error('unknown-tool error did not list the available tools')
    }
    expect(error.data.available_tools).toContain('list_sites')
  })

  it('rejects a non-object arguments value', async () => {
    const [frame] = await createHarness().send(
      request(7, 'tools/call', { name: 'list_sites', arguments: ['nope'] })
    )
    expect(frame).toMatchObject({ id: 7, error: { code: -32602 } })
  })
})

describe('malformed input', () => {
  it('answers unparseable JSON with a parse error and keeps serving', async () => {
    const harness = createHarness()
    const [bad] = await harness.sendRaw('{ this is not json\n')
    expect(bad).toMatchObject({ jsonrpc: '2.0', id: null, error: { code: -32700 } })

    const [good] = await harness.send(request(8, 'tools/list'))
    expect(good).toHaveProperty('result')
  })

  it('rejects a wrong jsonrpc version but still echoes the id', async () => {
    const [frame] = await createHarness().send({ jsonrpc: '1.0', id: 9, method: 'tools/list' })
    expect(frame).toMatchObject({ id: 9, error: { code: -32600 } })
  })

  it('rejects a top-level array', async () => {
    const [frame] = await createHarness().sendRaw('[1,2,3]\n')
    expect(frame).toMatchObject({ id: null, error: { code: -32600 } })
  })

  it('rejects non-object params', async () => {
    const [frame] = await createHarness().send({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: 'list_sites'
    })
    expect(frame).toMatchObject({ id: 10, error: { code: -32602 } })
  })

  it('answers an unknown method with method-not-found', async () => {
    const [frame] = await createHarness().send(request(11, 'resources/list'))
    expect(frame).toMatchObject({ id: 11, error: { code: -32601 } })
  })

  it('answers ping', async () => {
    const [frame] = await createHarness().send(request(12, 'ping'))
    expect(frame).toMatchObject({ id: 12, result: {} })
  })
})

describe('a complete client session', () => {
  // The exact sequence Claude Code sends on connect, delivered as one arbitrary byte stream.
  it('handshakes, lists tools, calls one, and survives a bad frame mid-session', async () => {
    const harness = createHarness()
    const session = [
      JSON.stringify(
        request(1, 'initialize', {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'claude-code', version: '1.0.0' }
        })
      ),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify(request(2, 'tools/list')),
      '{ truncated',
      JSON.stringify(
        request(3, 'tools/call', { name: 'preview_run', arguments: { group: 'import' } })
      ),
      JSON.stringify(request(4, 'ping'))
    ].join('\n')

    // Split mid-frame to prove reassembly across chunk boundaries.
    const cut = Math.floor(session.length / 2)
    harness.push(session.slice(0, cut))
    const frames = await harness.sendRaw(`${session.slice(cut)}\n`)

    expect(frames.map((frame) => frame.id)).toEqual([1, 2, null, 3, 4])
    expect(frames[0]).toHaveProperty('result.serverInfo.name', SITE_MCP_SERVER_NAME)
    expect(frames[2]).toHaveProperty('error.code', -32700)
    expect(frames[4]).toHaveProperty('result', {})

    const call: unknown = frames[3]?.result
    if (!isPlainJsonObject(call) || !Array.isArray(call.content)) {
      throw new Error(`preview_run returned no content: ${JSON.stringify(frames[3])}`)
    }
    const [entry] = call.content
    if (!isPlainJsonObject(entry) || typeof entry.text !== 'string') {
      throw new Error('preview_run content is not a text block')
    }
    expect(entry.text).not.toContain(SSH_SECRET)
    expect(JSON.parse(entry.text)).toMatchObject({
      site: 'Acme',
      group: 'import',
      environment: 'main',
      blocked_by: ['no-steps-selected']
    })
  })
})

describe('stream framing', () => {
  it('reassembles a request split across chunks and answers in arrival order', async () => {
    const harness = createHarness()
    const first = JSON.stringify(request(20, 'ping'))
    harness.frames.length = 0
    const frames = await harness.sendRaw(
      `${first.slice(0, 12)}${first.slice(12)}\n${JSON.stringify(request(21, 'tools/list'))}\n`
    )
    expect(frames.map((frame) => frame.id)).toEqual([20, 21])
  })

  it('ignores blank lines between frames', async () => {
    const frames = await createHarness().sendRaw(`\n\n${JSON.stringify(request(22, 'ping'))}\n\n`)
    expect(frames).toHaveLength(1)
  })

  it('holds a partial line until its newline arrives', async () => {
    const lines: string[] = []
    const reader = createLineReader((line) => lines.push(line))
    reader.push('{"a":')
    expect(lines).toEqual([])
    reader.push('1}\n{"b":2}')
    expect(lines).toEqual(['{"a":1}'])
    reader.end()
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })
})

describe('parseJsonRpcFrame', () => {
  it('distinguishes a notification from a request with a null id', () => {
    const notification = parseJsonRpcFrame('{"jsonrpc":"2.0","method":"x"}')
    const nullId = parseJsonRpcFrame('{"jsonrpc":"2.0","id":null,"method":"x"}')
    expect(notification.ok && 'id' in notification.request).toBe(false)
    expect(nullId.ok && 'id' in nullId.request).toBe(true)
  })
})
