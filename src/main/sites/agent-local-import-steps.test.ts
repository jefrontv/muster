import { describe, expect, it } from 'vitest'
import type { SiteEnvironment, Site } from '../../shared/site-types'
import { createEmptySiteEnvironment } from '../../shared/site-types'
import type { AgentLocalHost, AgentLocalResponse } from './agent-local-host'
import { agentLocalVersionAtLeast } from './agent-local-import-api'
import {
  decideAgentLocalRoutes,
  importDatabaseViaAgentLocal,
  rewriteDomainViaAgentLocal,
  verifySiteViaAgentLocal,
  verifyUploadFallbackViaAgentLocal
} from './agent-local-import-steps'
import { SiteRunStepError, type SiteRunConfig, type SiteRunContext } from './pipeline-contract'

type Route = AgentLocalResponse | AgentLocalResponse[]

function host(
  routes: Record<string, Route>
): AgentLocalHost & { calls: string[]; bodies: unknown[] } {
  const calls: string[] = []
  const bodies: unknown[] = []
  const queues = new Map(
    Object.entries(routes).map(([route, value]) => [
      route,
      Array.isArray(value) ? [...value] : [value]
    ])
  )
  const created = {
    platform: 'darwin',
    homeDir: '/home/test',
    readToken: async () => 'token',
    request: async (method: string, apiPath: string, body?: unknown) => {
      const route = `${method} ${apiPath}`
      calls.push(route)
      bodies.push(body)
      const queue = queues.get(route)
      if (!queue || queue.length === 0) {
        return { ok: false, status: 404, error: `unrouted ${route}` }
      }
      return queue.length > 1 ? (queue.shift() as AgentLocalResponse) : queue[0]!
    },
    spawnDaemon: async () => ({ kind: 'started' as const }),
    sleep: async () => undefined
  } as AgentLocalHost
  return Object.assign(created, { calls, bodies })
}

function context(): SiteRunContext & { logs: string[]; statuses: string[] } {
  const logs: string[] = []
  const statuses: string[] = []
  return {
    signal: new AbortController().signal,
    log: (line) => logs.push(line),
    status: (stage) => statuses.push(stage),
    progress: () => undefined,
    throwIfCancelled: () => undefined,
    logs,
    statuses
  }
}

function config(localStack: Site['localStack'] = 'agent-local'): SiteRunConfig {
  const environment: SiteEnvironment = {
    ...createEmptySiteEnvironment(),
    hostname: 'srv.example.com',
    username: 'deploy',
    rootPath: 'public_html',
    liveDomain: 'acme.com.au'
  }
  return {
    site: {
      id: 'site-1',
      path: '/Sites/acme',
      repoId: null,
      displayName: 'Acme',
      localWpRoot: '',
      localDomain: 'acme.local',
      localStack,
      dbUser: 'root',
      dbSocket: '',
      dbPort: null,
      phpVersion: '8.2',
      activeEnvironment: 'main',
      environments: { main: environment },
      notes: '',
      searchReplaceTimeoutSeconds: 0
    },
    environmentName: 'main',
    environment,
    group: 'import',
    wpDir: '/Sites/acme',
    sshPassword: '',
    dbPassword: ''
  }
}

const ok = (data: unknown): AgentLocalResponse => ({ ok: true, status: 200, data })
const ACME = { slug: 'acme', domain: 'acme.local' }
const status = (version: string): AgentLocalResponse =>
  ok({ version, installed: version, update: {} })

describe('agentLocalVersionAtLeast', () => {
  it('compares numerically, not lexically', () => {
    expect(agentLocalVersionAtLeast('0.27.0', '0.27.0')).toBe(true)
    expect(agentLocalVersionAtLeast('0.30.1', '0.27.0')).toBe(true)
    expect(agentLocalVersionAtLeast('0.9.9', '0.27.0')).toBe(false)
    expect(agentLocalVersionAtLeast('1.0.0', '0.27.0')).toBe(true)
    expect(agentLocalVersionAtLeast('', '0.27.0')).toBe(false)
  })
})

describe('decideAgentLocalRoutes', () => {
  it('refuses a site on another stack without touching the daemon', async () => {
    const h = host({})
    const decided = await decideAgentLocalRoutes(config('localwp'), { host: h })
    expect(decided.slug).toBeNull()
    expect(h.calls).toEqual([])
  })

  it('refuses an old daemon and names the version', async () => {
    const h = host({ 'GET /status': status('0.32.1') })
    const decided = await decideAgentLocalRoutes(config(), {
      host: h,
      resolveSite: async () => ({ slug: 'acme', domain: 'acme.local' })
    })
    expect(decided).toEqual({
      slug: null,
      reason: expect.stringContaining('Agent Local 0.32.1 is older than 0.32.2')
    })
  })

  // 0.32.2 is the first daemon that heals a stale `kind: empty`, which is what leaves a site with
  // no uploads prefix and no media fallback however correct the .htaccess rule is.
  it('returns the slug on a new enough daemon that lists the site', async () => {
    const h = host({ 'GET /status': status('0.32.2') })
    const decided = await decideAgentLocalRoutes(config(), {
      host: h,
      resolveSite: async () => ({ slug: 'acme', domain: 'acme.local' })
    })
    expect(decided).toEqual({ slug: 'acme', domain: 'acme.local' })
  })
})

describe('importDatabaseViaAgentLocal', () => {
  it('starts an async job, relays its steps, and logs the daemon summary', async () => {
    const h = host({
      'POST /sites/acme/db/import?async=1': {
        ok: true,
        status: 202,
        data: { id: 'job-1', status: 'running' }
      },
      'GET /jobs/job-1': [
        ok({
          id: 'job-1',
          status: 'running',
          steps: [{ stage: 'database', detail: 'loading dump.sql.gz' }]
        }),
        ok({
          id: 'job-1',
          status: 'ok',
          steps: [{ stage: 'database', detail: 'loading dump.sql.gz' }],
          result:
            'saved snap-1, imported dump.sql.gz into al_acme (62 tables), urls acme.com.au → acme.local'
        })
      ]
    })
    const ctx = context()
    await importDatabaseViaAgentLocal(ctx, config(), ACME, '/tmp/dump.sql.gz', { host: h })
    const importCall = h.calls.indexOf('POST /sites/acme/db/import?async=1')
    expect(h.bodies[importCall]).toEqual({ path: '/tmp/dump.sql.gz', keep_urls: false })
    expect(ctx.logs).toEqual([
      'database: loading dump.sql.gz',
      'saved snap-1, imported dump.sql.gz into al_acme (62 tables), urls acme.com.au → acme.local'
    ])
    expect(ctx.statuses.at(-1)).toBe('Database imported')
  })

  it('fails the step with the job error', async () => {
    const h = host({
      'POST /sites/acme/db/import?async=1': {
        ok: true,
        status: 202,
        data: { id: 'job-2', status: 'running' }
      },
      'GET /jobs/job-2': ok({
        id: 'job-2',
        status: 'error',
        steps: [],
        error: 'snapshot failed: disk full'
      })
    })
    await expect(
      importDatabaseViaAgentLocal(context(), config(), ACME, '/tmp/dump.sql.gz', { host: h })
    ).rejects.toMatchObject({ name: 'SiteRunStepError', message: 'snapshot failed: disk full' })
  })
})

describe('rewriteDomainViaAgentLocal', () => {
  // jefrontv/muster#29: one literal pass rewrote www.acme.com.au to www.acme.local. The www needle
  // runs first, and the two passes report as one line with each column counted once.
  it('applies both passes, www first, and reports pins when the daemon repointed wp-config', async () => {
    const h = host({
      'GET /certs/acme.local': ok({ exists: true, trusted: true }),
      'POST /sites/acme/db/search-replace': [
        ok({
          hits: [{ table: 'wp_options', column: 'option_value', count: 2 }],
          total: 2,
          config_pins_rewritten: false
        }),
        ok({
          hits: [
            { table: 'wp_options', column: 'option_value', count: 2 },
            { table: 'wp_posts', column: 'post_content', count: 12 }
          ],
          total: 14,
          config_pins_rewritten: true
        })
      ]
    })
    const ctx = context()
    await rewriteDomainViaAgentLocal(ctx, config(), ACME, { host: h })
    const replaced = h.calls
      .map((call, index) => ({ call, body: h.bodies[index] }))
      .filter((entry) => entry.call === 'POST /sites/acme/db/search-replace')
      .map((entry) => entry.body)
    expect(replaced).toEqual([
      { old: 'www.acme.com.au', new: 'acme.local', dry_run: false },
      { old: 'acme.com.au', new: 'acme.local', dry_run: false }
    ])
    expect(ctx.logs).toEqual([
      'Replaced 16 reference(s) to acme.com.au across 2 column(s).',
      'wp-config.php URL constants repointed to acme.local.'
    ])
  })

  it('skips the daemon entirely when the live and local domains are the same host', async () => {
    const h = host({})
    const ctx = context()
    const same = config()
    same.environment.liveDomain = 'www.acme.local'

    await rewriteDomainViaAgentLocal(ctx, same, ACME, { host: h })

    expect(h.calls).toEqual([])
    expect(ctx.logs.join('\n')).toContain('are the same host')
  })
})

describe('verifyUploadFallbackViaAgentLocal', () => {
  it('confirms the rule when the daemon reports it as effective', async () => {
    const h = host({
      'GET /sites/acme/media': ok({
        media_fallback: 'https://acme.com.au',
        effective: true,
        uploads_prefix: 'wp-content/uploads',
        kind: 'wordpress'
      })
    })
    const ctx = context()

    await verifyUploadFallbackViaAgentLocal(ctx, config(), ACME, { host: h })

    expect(ctx.logs).toEqual(['Missing uploads fall back to https://acme.com.au.'])
  })

  // `effective`, `uploads_prefix` and `kind` postdate the 0.32.2 floor, so a daemon at the floor
  // sends none of them. Missing is unknown, not broken: the origin alone still passes.
  it('accepts an older daemon that reports the origin and nothing else', async () => {
    const h = host({ 'GET /sites/acme/media': ok({ media_fallback: 'https://acme.com.au' }) })
    const ctx = context()

    await verifyUploadFallbackViaAgentLocal(ctx, config(), ACME, { host: h })

    expect(ctx.logs).toEqual(['Missing uploads fall back to https://acme.com.au.'])
  })

  // The reported shape: the .htaccess rule parsed fine, but a stale record left the site with no
  // uploads prefix, so nothing could redirect and every upload 404ed anyway.
  it('warns when the origin is right but the daemon says it cannot fire', async () => {
    const h = host({
      'GET /sites/acme/media': ok({
        media_fallback: 'https://acme.com.au',
        effective: false,
        uploads_prefix: '',
        kind: 'empty'
      })
    })
    const ctx = context()

    await expect(
      verifyUploadFallbackViaAgentLocal(ctx, config(), ACME, { host: h })
    ).resolves.toBeUndefined()

    expect(ctx.logs).toHaveLength(1)
    expect(ctx.logs[0]).toContain('cannot apply it')
    expect(ctx.logs[0]).toContain('no uploads prefix')
    expect(ctx.logs[0]).toContain('"empty"')
    expect(ctx.logs[0]).toContain('agent-local doctor acme')
  })

  // The reported symptom: the rewrite step said "added successfully" and every upload still 404ed.
  it('warns, without failing the run, when the daemon serves no fallback at all', async () => {
    const h = host({ 'GET /sites/acme/media': ok({ media_fallback: '', kind: 'empty' }) })
    const ctx = context()

    await expect(
      verifyUploadFallbackViaAgentLocal(ctx, config(), ACME, { host: h })
    ).resolves.toBeUndefined()

    expect(ctx.logs).toHaveLength(1)
    expect(ctx.logs[0]).toContain('⚠ Agent Local serves no upload fallback')
    expect(ctx.logs[0]).toContain('"empty"')
    expect(ctx.logs[0]).toContain('agent-local doctor acme')
  })

  it('warns when the daemon sends uploads somewhere else', async () => {
    const h = host({ 'GET /sites/acme/media': ok({ media_fallback: 'https://old.example' }) })
    const ctx = context()

    await verifyUploadFallbackViaAgentLocal(ctx, config(), ACME, { host: h })

    expect(ctx.logs[0]).toContain('sends missing uploads to https://old.example')
    expect(ctx.logs[0]).toContain('https://acme.com.au')
  })

  it('says so, and moves on, when the daemon cannot answer', async () => {
    const h = host({})
    const ctx = context()

    await verifyUploadFallbackViaAgentLocal(ctx, config(), ACME, { host: h })

    expect(ctx.logs[0]).toContain('Could not confirm the upload fallback')
  })
})

describe('rewriteDomainViaAgentLocal with a drifted record', () => {
  it('rewrites to the domain the daemon serves, not the one Muster stored, and says so', async () => {
    // Seen live on pact: the record said pact.local, agent-local served pact.al, and every rewrite
    // went to a host nothing answered on.
    const h = host({
      'GET /certs/pact.al': ok({ exists: false, trusted: false }),
      'POST /sites/pact/db/search-replace': ok({ hits: [], total: 0, config_pins_rewritten: false })
    })
    const ctx = context()
    await rewriteDomainViaAgentLocal(
      ctx,
      config(),
      { slug: 'pact', domain: 'pact.al' },
      { host: h }
    )
    const replaceCall = h.calls.indexOf('POST /sites/pact/db/search-replace')
    expect(h.bodies[replaceCall]).toEqual({
      old: 'www.acme.com.au',
      new: 'pact.al',
      dry_run: false
    })
    expect(ctx.logs[0]).toContain('Agent Local serves this site on pact.al, not acme.local')
  })
})

describe('verifySiteViaAgentLocal', () => {
  it('passes a healthy site', async () => {
    const h = host({ 'POST /sites/acme/probe': ok({ verdict: 'healthy', reason: '' }) })
    const ctx = context()
    await verifySiteViaAgentLocal(ctx, 'acme', { host: h })
    expect(ctx.logs).toEqual(['Site check: healthy.'])
  })

  it('warns but passes a slow site', async () => {
    const h = host({ 'POST /sites/acme/probe': ok({ verdict: 'slow', reason: '"/" took 4100ms' }) })
    const ctx = context()
    await verifySiteViaAgentLocal(ctx, 'acme', { host: h })
    expect(ctx.logs).toEqual(['⚠ Site check: slow: "/" took 4100ms'])
  })

  it('fails the run when the site redirects off-site, naming the host', async () => {
    const h = host({
      'POST /sites/acme/probe': ok({ verdict: 'redirects_offsite', reason: 'acme.com.au' })
    })
    await expect(verifySiteViaAgentLocal(context(), 'acme', { host: h })).rejects.toBeInstanceOf(
      SiteRunStepError
    )
    await expect(verifySiteViaAgentLocal(context(), 'acme', { host: h })).rejects.toThrow(
      'redirects_offsite: acme.com.au'
    )
  })

  it('passes, with a warning, when the homepage rendered despite a logged fatal', async () => {
    // WP Rocket 3.4 on PHP 8.4 throws in a late minify callback after the page is already out.
    const h = host({
      'POST /sites/acme/probe': ok({
        verdict: 'fatal',
        reason: 'PHP Fatal error: implode(): Argument #1 must be of type string',
        requests: { '/': { status: 200, body_bytes: 93818 } }
      }),
      'GET /sites/acme/errors?since=5m&limit=5': ok({ entries: [] })
    })
    const ctx = context()
    await verifySiteViaAgentLocal(ctx, 'acme', { host: h })
    expect(ctx.logs.at(-1)).toContain('the homepage renders, but PHP logged an error')
  })

  it('lists recent PHP errors before failing on a fatal that stopped the page', async () => {
    const h = host({
      'POST /sites/acme/probe': ok({
        verdict: 'fatal',
        reason: 'PHP Fatal error: Uncaught Error',
        requests: { '/': { status: 500, body_bytes: 0 } }
      }),
      'GET /sites/acme/errors?since=5m&limit=5': ok({
        entries: [
          {
            level: 'fatal',
            message: 'Uncaught Error: Call to undefined function',
            file: 'functions.php',
            line: 12
          }
        ]
      })
    })
    const ctx = context()
    await expect(verifySiteViaAgentLocal(ctx, 'acme', { host: h })).rejects.toBeInstanceOf(
      SiteRunStepError
    )
    expect(ctx.logs).toEqual([
      '  fatal: Uncaught Error: Call to undefined function (functions.php:12)'
    ])
  })

  it('does not fail the run when the probe itself could not run', async () => {
    const h = host({
      'POST /sites/acme/probe': { ok: false, status: 500, error: 'site is not running' }
    })
    const ctx = context()
    await verifySiteViaAgentLocal(ctx, 'acme', { host: h })
    expect(ctx.logs[0]).toContain('Could not check the site')
  })
})
