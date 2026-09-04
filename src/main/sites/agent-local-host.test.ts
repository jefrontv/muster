import { afterEach, describe, expect, it } from 'vitest'
import {
  AGENT_LOCAL_DAEMON_DOWN,
  AGENT_LOCAL_DAEMON_UNREACHABLE,
  AGENT_LOCAL_NOT_INSTALLED,
  agentLocalTokenPath,
  createAgentLocalHost,
  describeAgentLocalResponse,
  isAgentLocalSupported,
  redactAgentLocalValue,
  requestWithDaemon,
  type AgentLocalHost,
  type AgentLocalResponse,
  type AgentLocalSpawnOutcome
} from './agent-local-host'

function fakeHost(
  responses: AgentLocalResponse[],
  overrides: Partial<AgentLocalHost> = {},
  spawnOutcome: AgentLocalSpawnOutcome = { kind: 'started' }
): AgentLocalHost & { calls: string[]; spawns: number } {
  const calls: string[] = []
  let spawns = 0
  const queue = [...responses]
  const host = {
    platform: 'darwin',
    homeDir: '/home/test',
    readToken: async () => 'token',
    request: async (method: string, apiPath: string) => {
      calls.push(`${method} ${apiPath}`)
      return queue.shift() ?? { ok: true, status: 200, data: 'exhausted' }
    },
    spawnDaemon: async () => {
      spawns += 1
      return spawnOutcome
    },
    sleep: async () => undefined,
    ...overrides
  } as AgentLocalHost
  // defineProperty, not Object.assign: assign copies a getter's current value, freezing spawns at 0.
  return Object.defineProperty(Object.assign(host, { calls, spawns: 0 }), 'spawns', {
    get: () => spawns
  }) as AgentLocalHost & { calls: string[]; spawns: number }
}

describe('redactAgentLocalValue', () => {
  it('masks every credential field a site payload carries', () => {
    const redacted = redactAgentLocalValue({
      slug: 'sulo',
      db: { user: 'al_sulo', pass: 'hunter2', port: 10360 },
      db_pass: 'hunter2',
      admin_pass: 'hunter2'
    })

    expect(redacted).toEqual({
      slug: 'sulo',
      db: { user: 'al_sulo', pass: '[redacted]', port: 10360 },
      db_pass: '[redacted]',
      admin_pass: '[redacted]'
    })
  })

  it('walks arrays, so GET /sites cannot leak the second site', () => {
    const redacted = redactAgentLocalValue([{ db_pass: 'a' }, { db_pass: 'b' }])

    expect(JSON.stringify(redacted)).not.toContain('"a"')
    expect(JSON.stringify(redacted)).not.toContain('"b"')
  })

  it('leaves an empty password alone rather than inventing a secret', () => {
    expect(redactAgentLocalValue({ db_pass: '' })).toEqual({ db_pass: '' })
  })
})

describe('describeAgentLocalResponse', () => {
  it('never renders a password into a human-facing string', () => {
    const described = describeAgentLocalResponse({
      ok: true,
      status: 200,
      data: { slug: 'sulo', db: { pass: 'hunter2' } }
    })

    expect(described).not.toContain('hunter2')
    expect(described).toContain('sulo')
  })

  it('prefers the daemon error text when there is one', () => {
    expect(
      describeAgentLocalResponse({ ok: false, status: 404, error: 'no site manages /tmp' })
    ).toBe('no site manages /tmp')
  })
})

describe('requestWithDaemon', () => {
  it('passes a live response straight through without spawning', async () => {
    const host = fakeHost([{ ok: true, status: 200, data: 'up' }])

    const result = await requestWithDaemon(host, 'GET', '/status')

    expect(result.data).toBe('up')
    expect(host.spawns).toBe(0)
  })

  it('spawns once, waits for /status, then retries the original call', async () => {
    const host = fakeHost([
      { ok: false, status: 0, error: AGENT_LOCAL_DAEMON_DOWN },
      { ok: false, status: 0, error: AGENT_LOCAL_DAEMON_DOWN },
      { ok: true, status: 200, data: { running: true } },
      { ok: true, status: 200, data: { slug: 'sulo' } }
    ])

    const result = await requestWithDaemon(host, 'POST', '/sites/sulo/start')

    expect(result.data).toEqual({ slug: 'sulo' })
    expect(host.spawns).toBe(1)
    expect(host.calls).toEqual([
      'POST /sites/sulo/start',
      'GET /status',
      'GET /status',
      'POST /sites/sulo/start'
    ])
  })

  it('says the daemon did not come back when restart ran and the API stayed silent', async () => {
    // Not the original "not running": that was true before the restart and reads as "start it",
    // which is exactly what was just tried.
    const host = fakeHost(
      Array.from({ length: 200 }, () => ({
        ok: false,
        status: 0,
        error: AGENT_LOCAL_DAEMON_DOWN
      })),
      {},
      { kind: 'failed', detail: 'launchctl: Bootstrap failed' }
    )

    const result = await requestWithDaemon(host, 'GET', '/sites')

    expect(result.error).toBe(`${AGENT_LOCAL_DAEMON_UNREACHABLE} (launchctl: Bootstrap failed)`)
    expect(host.spawns).toBe(1)
  })

  it('says Agent Local is not installed when the binary is missing, without polling for it', async () => {
    const host = fakeHost(
      Array.from({ length: 5 }, () => ({ ok: false, status: 0, error: AGENT_LOCAL_DAEMON_DOWN })),
      {},
      { kind: 'not-installed' }
    )

    const result = await requestWithDaemon(host, 'GET', '/sites')

    expect(result.error).toBe(AGENT_LOCAL_NOT_INSTALLED)
    expect(host.calls).toEqual(['GET /sites'])
  })

  it('does not spawn for a real API failure — a 404 is an answer, not a dead socket', async () => {
    const host = fakeHost([{ ok: false, status: 404, error: 'no site manages /tmp' }])

    const result = await requestWithDaemon(host, 'GET', '/resolve?path=%2Ftmp')

    expect(result.status).toBe(404)
    expect(host.spawns).toBe(0)
  })
})

describe('createAgentLocalHost', () => {
  it('returns null rather than throwing when the token file is missing', async () => {
    const host = createAgentLocalHost({ homeDir: '/nonexistent-agent-local-home' })

    await expect(host.readToken()).resolves.toBeNull()
  })

  it('refuses to request without a token, and says what to do about it', async () => {
    const host = createAgentLocalHost({ readToken: async () => null })

    const result = await host.request('GET', '/status')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('token')
  })

  it('reads the token from ~/.agent-local/token', () => {
    expect(agentLocalTokenPath({ homeDir: '/home/test' })).toBe('/home/test/.agent-local/token')
  })

  // The tests above stub `request` wholesale, so nothing exercised the real one until a live run
  // failed with "Cannot access 'body' before initialization" — the request parameter and a local
  // of the same name. These drive the actual implementation against a stubbed fetch.
  describe('the real request implementation', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    function headersOf(call?: { init: RequestInit }): Record<string, string> {
      return (call?.init.headers ?? {}) as Record<string, string>
    }

    function stubFetch(response: { status?: number; body?: string }): {
      calls: { url: string; init: RequestInit }[]
    } {
      const calls: { url: string; init: RequestInit }[] = []
      globalThis.fetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return {
          ok: (response.status ?? 200) < 400,
          status: response.status ?? 200,
          text: async () => response.body ?? '',
          body: null
        }
      }) as unknown as typeof fetch
      return { calls }
    }

    it('sends a GET and unwraps the envelope', async () => {
      const { calls } = stubFetch({ body: JSON.stringify({ ok: true, data: { sites: 2 } }) })
      const host = createAgentLocalHost({ readToken: async () => 'tok' })

      const result = await host.request('GET', '/status')

      expect(result).toMatchObject({ ok: true, status: 200, data: { sites: 2 } })
      expect(calls[0]?.url).toBe('http://127.0.0.1:10809/status')
      expect(headersOf(calls[0]).Authorization).toBe('Bearer tok')
    })

    it('serialises a request body and sets the content type', async () => {
      const { calls } = stubFetch({ body: JSON.stringify({ ok: true, data: 'imported' }) })
      const host = createAgentLocalHost({ readToken: async () => 'tok' })

      const result = await host.request('POST', '/import', { source: '/Sites/acme' })

      expect(result.data).toBe('imported')
      expect(calls[0]?.init.body).toBe('{"source":"/Sites/acme"}')
      expect(headersOf(calls[0])['Content-Type']).toBe('application/json')
    })

    it('carries the daemon error text through on a failure envelope', async () => {
      stubFetch({ status: 404, body: JSON.stringify({ ok: false, error: 'no site manages /tmp' }) })
      const host = createAgentLocalHost({ readToken: async () => 'tok' })

      const result = await host.request('GET', '/resolve?path=%2Ftmp')

      expect(result).toMatchObject({ ok: false, status: 404, error: 'no site manages /tmp' })
    })

    it('treats an unparseable body as a failed call rather than throwing', async () => {
      stubFetch({ status: 500, body: '<html>gateway</html>' })
      const host = createAgentLocalHost({ readToken: async () => 'tok' })

      const result = await host.request('GET', '/status')

      expect(result.ok).toBe(false)
      expect(result.status).toBe(500)
    })
  })
})

describe('isAgentLocalSupported', () => {
  it.each([
    ['darwin', true],
    ['linux', false],
    ['win32', false]
  ])('%s -> %s', (platform, supported) => {
    expect(isAgentLocalSupported({ platform })).toBe(supported)
  })
})
