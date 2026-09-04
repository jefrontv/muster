import { describe, expect, it } from 'vitest'
import type { AgentLocalHost, AgentLocalResponse } from './agent-local-host'
import {
  AGENT_LOCAL_NOT_MANAGED,
  agentLocalCredentials,
  detectAgentLocalStack,
  ensureAgentLocalSiteRunning,
  releaseAgentLocalPrivilegedPorts,
  resolveAgentLocalSite,
  setAgentLocalSiteDomain,
  stopAgentLocalSite
} from './agent-local-site-control'

// The two live sites on this machine, which is what makes the layout realistic: agent-local imported
// them from LocalWP, so the docroot is <repo>/app/public while Muster keys the site by <repo>.
const SITES = [
  {
    slug: 'orleton-om',
    work_dir: '/Sites/orleton-om/app',
    wp_dir: '/Sites/orleton-om/app/public',
    domain: 'orleton-om.test',
    php_version: '8.2',
    state: 'running'
  },
  {
    slug: 'sulo',
    work_dir: '/Sites/sulo/app',
    wp_dir: '/Sites/sulo/app/public',
    domain: 'sulo.test',
    php_version: '8.2',
    state: 'stopped'
  }
]

function host(
  routes: Record<string, AgentLocalResponse>,
  overrides: Partial<AgentLocalHost> = {}
): AgentLocalHost & { calls: string[] } {
  const calls: string[] = []
  const created = {
    platform: 'darwin',
    homeDir: '/home/test',
    readToken: async () => 'token',
    request: async (method: string, apiPath: string) => {
      const route = apiPath.startsWith('/resolve') ? `${method} /resolve` : `${method} ${apiPath}`
      calls.push(route)
      return routes[route] ?? { ok: false, status: 404, error: 'not found' }
    },
    spawnDaemon: async () => ({ kind: 'started' as const }),
    sleep: async () => undefined,
    ...overrides
  } as AgentLocalHost
  return Object.assign(created, { calls })
}

const listSites: Record<string, AgentLocalResponse> = {
  'GET /sites': { ok: true, status: 200, data: SITES }
}

describe('resolveAgentLocalSite', () => {
  it('trusts GET /resolve when the live path is already registered', async () => {
    const { match } = await resolveAgentLocalSite(
      { path: '/Users/jake/Sites/ebes', localStack: 'agent-local' },
      {
        host: host({
          'GET /resolve': {
            ok: true,
            status: 200,
            data: {
              slug: 'ebes',
              running: true,
              site: {
                slug: 'ebes',
                work_dir: '/Users/jake/Sites/ebes',
                wp_dir: '/Users/jake/Sites/ebes',
                domain: 'ebes.local',
                php_version: '8.4',
                state: 'running'
              }
            }
          }
        })
      }
    )

    expect(match).toMatchObject({ slug: 'ebes', running: true, wpDir: '/Users/jake/Sites/ebes' })
  })

  it('matches a leftover slug when the recorded work dir is gone', async () => {
    const { match } = await resolveAgentLocalSite(
      { path: '/Users/jake/Sites/ebes', localStack: 'agent-local' },
      {
        host: host({
          'GET /sites': {
            ok: true,
            status: 200,
            data: [
              {
                slug: 'ebes',
                work_dir: '/old/deleted/ebes',
                wp_dir: '/old/deleted/ebes',
                domain: 'ebes.local',
                php_version: '8.4',
                state: 'stopped'
              }
            ]
          }
        })
      }
    )

    expect(match?.slug).toBe('ebes')
  })

  it('rejects a greedy /resolve answer whose work_dir is a parent of many checkouts', async () => {
    // Real incident: a site registered with work_dir=/Sites made the daemon "resolve" every
    // sibling folder, so watchswiss.com adopted transportaustralia's domain (and Start/Stop
    // would have driven the wrong site). The by-path list scan must win instead.
    const { match } = await resolveAgentLocalSite(
      { path: '/Sites/watchswiss.com', localStack: 'agent-local' },
      {
        host: host({
          'GET /resolve': {
            ok: true,
            status: 200,
            data: {
              slug: 'roads-australia',
              running: true,
              site: {
                slug: 'roads-australia',
                work_dir: '/Sites',
                wp_dir: '/Sites/roads-australia',
                domain: 'transportaustralia.local',
                php_version: '8.4',
                state: 'running'
              }
            }
          },
          'GET /sites': {
            ok: true,
            status: 200,
            data: [
              {
                slug: 'roads-australia',
                work_dir: '/Sites',
                wp_dir: '/Sites/roads-australia',
                domain: 'transportaustralia.local',
                php_version: '8.4',
                state: 'running'
              },
              {
                slug: 'watchswiss-com',
                work_dir: '/Sites/watchswiss.com/app',
                wp_dir: '/Sites/watchswiss.com/app/public',
                domain: 'watchswiss-al.local',
                php_version: '8.2',
                state: 'running'
              }
            ]
          }
        })
      }
    )

    expect(match?.slug).toBe('watchswiss-com')
    expect(match?.domain).toBe('watchswiss-al.local')
  })

  it('matches a repo root whose docroot sits below it — the case GET /resolve 404s on', async () => {
    const { match } = await resolveAgentLocalSite(
      { path: '/Sites/orleton-om', localStack: 'agent-local' },
      { host: host(listSites) }
    )

    expect(match?.slug).toBe('orleton-om')
    expect(match?.wpDir).toBe('/Sites/orleton-om/app/public')
  })

  it('matches the docroot itself', async () => {
    const { match } = await resolveAgentLocalSite(
      { path: '/Sites/sulo/app/public', localStack: 'agent-local' },
      { host: host(listSites) }
    )

    expect(match?.slug).toBe('sulo')
  })

  it('does not match a sibling with a shared prefix', async () => {
    const { match } = await resolveAgentLocalSite(
      { path: '/Sites/sulo-staging', localStack: 'agent-local' },
      { host: host(listSites) }
    )

    expect(match).toBeNull()
  })

  it('returns no match for an unmanaged path rather than throwing', async () => {
    const { match } = await resolveAgentLocalSite(
      { path: '/tmp', localStack: 'agent-local' },
      { host: host(listSites) }
    )

    expect(match).toBeNull()
  })
})

describe('ensureAgentLocalSiteRunning', () => {
  it('starts the site and reports TCP details, never a socket path', async () => {
    const routes = {
      ...listSites,
      'POST /sites/sulo/start': {
        ok: true,
        status: 200,
        data: {
          slug: 'sulo',
          wp_dir: '/Sites/sulo/app/public',
          db: {
            host: '127.0.0.1',
            port: 10360,
            socket: '',
            name: 'al_sulo',
            user: 'al_sulo',
            pass: 'secret'
          }
        }
      }
    }

    const outcome = await ensureAgentLocalSiteRunning(
      { path: '/Sites/sulo', localStack: 'agent-local' },
      undefined,
      {
        host: host(routes)
      }
    )

    expect(outcome).toMatchObject({
      ok: true,
      state: 'running',
      // Empty is load-bearing: buildLocalMysqlConnectionOptions picks TCP by an empty socket.
      socketPath: '',
      port: 10360,
      user: 'al_sulo',
      password: 'secret',
      database: 'al_sulo'
    })
  })

  it('reports not-managed for a path agent-local does not own, and does not fail the run', async () => {
    const outcome = await ensureAgentLocalSiteRunning(
      { path: '/tmp', localStack: 'agent-local' },
      undefined,
      {
        host: host(listSites)
      }
    )

    expect(outcome).toMatchObject({
      ok: true,
      state: 'not-managed',
      message: AGENT_LOCAL_NOT_MANAGED
    })
  })

  it('is unsupported off macOS instead of dialling a daemon that cannot exist', async () => {
    const machine = host(listSites, { platform: 'linux' })

    const outcome = await ensureAgentLocalSiteRunning(
      { path: '/Sites/sulo', localStack: 'agent-local' },
      undefined,
      {
        host: machine
      }
    )

    expect(outcome.state).toBe('unsupported')
    expect(machine.calls).toEqual([])
  })

  it('fails with the daemon message when the start call errors', async () => {
    const routes = {
      ...listSites,
      'POST /sites/sulo/start': { ok: false, status: 500, error: 'php-fpm failed to bind' }
    }

    const outcome = await ensureAgentLocalSiteRunning(
      { path: '/Sites/sulo', localStack: 'agent-local' },
      undefined,
      {
        host: host(routes)
      }
    )

    expect(outcome).toMatchObject({ ok: false, state: 'failed', message: 'php-fpm failed to bind' })
  })
})

describe('stopAgentLocalSite', () => {
  it('resolves then stops by slug', async () => {
    const machine = host({
      ...listSites,
      'POST /sites/sulo/stop': { ok: true, status: 200, data: 'stopped' }
    })

    const outcome = await stopAgentLocalSite(
      { path: '/Sites/sulo', localStack: 'agent-local' },
      { host: machine }
    )

    expect(outcome).toMatchObject({ ok: true, state: 'stopped' })
    expect(machine.calls).toContain('POST /sites/sulo/stop')
  })
})

describe('agentLocalCredentials', () => {
  it('fetches live credentials rather than reading a stored copy', async () => {
    const routes = {
      ...listSites,
      'POST /sites/sulo/db': {
        ok: true,
        status: 200,
        data: { db: { port: 10360, name: 'al_sulo', user: 'al_sulo', pass: 'rotated' } }
      }
    }

    const credentials = await agentLocalCredentials(
      { path: '/Sites/sulo', localStack: 'agent-local' },
      { host: host(routes) }
    )

    expect(credentials).toEqual({
      socketPath: '',
      port: 10360,
      user: 'al_sulo',
      password: 'rotated',
      database: 'al_sulo'
    })
  })

  // Verbatim from a live daemon (v0.1.1): POST /sites/{slug}/db answers flat with `password` and
  // `database`, while /resolve and /start nest under `db` with `pass` and `name`. Reading only the
  // nested spelling loses the password silently and surfaces as an access-denied from MariaDB.
  it('reads the flat shape POST /sites/{slug}/db actually returns', async () => {
    const routes = {
      ...listSites,
      'POST /sites/sulo/db': {
        ok: true,
        status: 200,
        data: {
          database: 'al_sulo',
          host: '127.0.0.1',
          password: 'live-secret',
          port: 10360,
          user: 'al_sulo'
        }
      }
    }

    const credentials = await agentLocalCredentials(
      { path: '/Sites/sulo', localStack: 'agent-local' },
      { host: host(routes) }
    )

    expect(credentials).toEqual({
      socketPath: '',
      port: 10360,
      user: 'al_sulo',
      password: 'live-secret',
      database: 'al_sulo'
    })
  })

  it('returns null for an unmanaged site instead of guessing a transport', async () => {
    await expect(
      agentLocalCredentials({ path: '/tmp', localStack: 'agent-local' }, { host: host(listSites) })
    ).resolves.toBeNull()
  })
})

describe('detectAgentLocalStack', () => {
  const status = { 'GET /status': { ok: true, status: 200, data: { sites: 2 } } }

  it('reports the agent-local stack for a managed path', async () => {
    const detection = await detectAgentLocalStack('/Sites/orleton-om', {
      host: host({ ...status, ...listSites })
    })

    expect(detection).toMatchObject({
      stack: 'agent-local',
      registered: true,
      siteId: 'orleton-om',
      domain: 'orleton-om.test',
      socketPath: '',
      socketReady: true,
      phpVersion: '8.2'
    })
  })

  it('reports plain for an unmanaged path while the daemon is up', async () => {
    const detection = await detectAgentLocalStack('/tmp', {
      host: host({ ...status, ...listSites })
    })

    expect(detection).toMatchObject({ stack: 'plain', registered: false, appRunning: true })
  })

  it('degrades honestly when the daemon is unreachable', async () => {
    const machine = host(
      {},
      {
        request: async () => ({ ok: false, status: 0, error: 'agent-local daemon is not running' })
      }
    )

    const detection = await detectAgentLocalStack('/Sites/sulo', { host: machine })

    expect(detection.stack).toBe('plain')
    expect(detection.registered).toBe(false)
    expect(detection.reason).toContain('daemon')
  })
})

describe('releaseAgentLocalPrivilegedPorts', () => {
  it('yields the ports for the requested window', async () => {
    const bodies: unknown[] = []
    const machine = host(
      { 'POST /yield': { ok: true, status: 200, data: { seconds: 60 } } },
      {
        request: async (method: string, apiPath: string, body?: unknown) => {
          bodies.push(body)
          return method === 'POST' && apiPath === '/yield'
            ? { ok: true, status: 200 }
            : { ok: false, status: 404 }
        }
      }
    )

    await expect(releaseAgentLocalPrivilegedPorts(60, { host: machine })).resolves.toBe(true)
    expect(bodies).toEqual([{ seconds: 60 }])
  })

  // A daemon that is not running is not on those ports, which is what the caller is really asking.
  it('reports the ports free when the daemon is down', async () => {
    const machine = host(
      {},
      {
        request: async () => ({ ok: false, status: 0, error: 'agent-local daemon is not running' })
      }
    )

    await expect(releaseAgentLocalPrivilegedPorts(60, { host: machine })).resolves.toBe(true)
  })

  // Older builds have no /yield route: they hold the ports and will not let go, so say so.
  it('reports failure when the route is absent', async () => {
    const machine = host(
      {},
      {
        request: async () => ({ ok: false, status: 404, error: 'not found' })
      }
    )

    await expect(releaseAgentLocalPrivilegedPorts(60, { host: machine })).resolves.toBe(false)
  })

  it('never spawns a daemon just to make it stand aside', async () => {
    let spawned = 0
    const machine = host(
      {},
      {
        request: async () => ({ ok: false, status: 0, error: 'agent-local daemon is not running' }),
        spawnDaemon: async () => {
          spawned += 1
          return { kind: 'started' as const }
        }
      }
    )

    await releaseAgentLocalPrivilegedPorts(60, { host: machine })

    expect(spawned).toBe(0)
  })

  it('does nothing off macOS', async () => {
    const machine = host({}, { platform: 'win32' })

    await expect(releaseAgentLocalPrivilegedPorts(60, { host: machine })).resolves.toBe(false)
    expect(machine.calls).toEqual([])
  })
})

describe('setAgentLocalSiteDomain', () => {
  it('renames an already-registered site by slug', async () => {
    const machine = host({
      ...listSites,
      'POST /sites/sulo/domain': { ok: true, status: 200, data: 'ok' }
    })

    const outcome = await setAgentLocalSiteDomain(
      { path: '/Sites/sulo', localStack: 'agent-local' },
      'sulo.al',
      { host: machine }
    )

    expect(outcome.ok).toBe(true)
    expect(machine.calls).toContain('POST /sites/sulo/domain')
    expect(outcome.message).toContain('sulo.al')
  })

  it('reports the running state so a caller can keep its own view honest', async () => {
    // sulo is stopped in the fixture; a rename must not claim it started.
    const outcome = await setAgentLocalSiteDomain(
      { path: '/Sites/sulo', localStack: 'agent-local' },
      'sulo.al',
      {
        host: host({ ...listSites, 'POST /sites/sulo/domain': { ok: true, status: 200, data: '' } })
      }
    )
    expect(outcome.state).toBe('stopped')

    const running = await setAgentLocalSiteDomain(
      { path: '/Sites/orleton-om', localStack: 'agent-local' },
      'orleton.al',
      {
        host: host({
          ...listSites,
          'POST /sites/orleton-om/domain': { ok: true, status: 200, data: '' }
        })
      }
    )
    expect(running.state).toBe('running')
  })

  it('is a no-op when the site already serves that domain', async () => {
    // Why success rather than an error: the caller asked for a state that already holds, and
    // failing would make a re-run of the setup step look broken.
    const machine = host(listSites)

    const outcome = await setAgentLocalSiteDomain(
      { path: '/Sites/sulo', localStack: 'agent-local' },
      'sulo.test',
      { host: machine }
    )

    expect(outcome.ok).toBe(true)
    expect(machine.calls).not.toContain('POST /sites/sulo/domain')
  })

  it('refuses a folder agent-local does not serve, rather than creating a second site', async () => {
    const outcome = await setAgentLocalSiteDomain(
      { path: '/Sites/not-managed', localStack: 'agent-local' },
      'whatever.al',
      { host: host(listSites) }
    )

    expect(outcome.ok).toBe(false)
    expect(outcome.message).toBe(AGENT_LOCAL_NOT_MANAGED)
  })

  it('requires a domain', async () => {
    const machine = host(listSites)
    const outcome = await setAgentLocalSiteDomain(
      { path: '/Sites/sulo', localStack: 'agent-local' },
      '   ',
      { host: machine }
    )
    expect(outcome.ok).toBe(false)
    expect(machine.calls).not.toContain('POST /sites/sulo/domain')
  })

  it('surfaces a daemon refusal instead of reporting success', async () => {
    const outcome = await setAgentLocalSiteDomain(
      { path: '/Sites/sulo', localStack: 'agent-local' },
      'taken.al',
      {
        host: host({
          ...listSites,
          'POST /sites/sulo/domain': { ok: false, status: 409, data: 'domain in use' }
        })
      }
    )
    expect(outcome.ok).toBe(false)
  })
})
