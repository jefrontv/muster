import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { StreamCommandResult } from '../lib/stream-command'
import { createDdevHost, type DdevHost } from './ddev-host'
import { runDdevSetup } from './ddev-project-setup'
import {
  ddevCredentials,
  detectDdevStack,
  ensureDdevSiteRunning,
  stopDdevSite
} from './ddev-site-control'

const ROOT = '/Users/me/Sites/alchemy'

function result(overrides: Partial<StreamCommandResult> = {}): StreamCommandResult {
  return {
    code: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    truncated: false,
    stoppedEarly: false,
    ...overrides
  }
}

function describeLine(raw: Record<string, unknown>): string {
  return JSON.stringify({ level: 'info', msg: '', raw })
}

const RUNNING = {
  name: 'alchemy',
  status: 'running',
  approot: ROOT,
  docroot: '',
  php_version: '8.3',
  primary_url: 'https://alchemy.ddev.site:8843',
  performance_mode: 'mutagen',
  dbinfo: { published_port: 32790, username: 'db', password: 'db', dbname: 'db' }
}

type FakeState = {
  docker: boolean
  status: 'running' | 'stopped'
  type?: string
  routerUp?: boolean
}

function fakeHost(state: FakeState, calls: string[] = []): DdevHost {
  const files: Record<string, string> = {
    [path.join(ROOT, '.ddev', 'config.yaml')]:
      `name: alchemy\ntype: ${state.type ?? 'wordpress'}\nphp_version: "8.3"\n`,
    '/Users/me/.ddev/global_config.yaml': 'router_https_port: "8843"\n'
  }
  return createDdevHost({
    platform: 'darwin',
    homeDir: '/Users/me',
    findBinary: (tool) => (tool === 'colima' ? null : `/opt/homebrew/bin/${tool}`),
    readText: async (filePath) => files[filePath] ?? null,
    pathExists: async (filePath) => filePath in files,
    sleep: async () => {},
    canConnect: async () => state.routerUp ?? true,
    run: async (command, args) => {
      const tool = path.basename(command)
      calls.push(`${tool} ${args.join(' ')}`)
      if (tool === 'docker' && args[0] === 'info') {
        return state.docker ? result({ stdout: '29.5.2' }) : result({ code: 1 })
      }
      if (tool === 'ddev' && args[0] === 'describe') {
        return result({
          stdout: describeLine(
            state.status === 'running' ? RUNNING : { ...RUNNING, status: 'stopped', dbinfo: null }
          )
        })
      }
      if (tool === 'ddev' && args[0] === 'start') {
        state.status = 'running'
        return result()
      }
      if (tool === 'ddev' && args[0] === 'stop') {
        state.status = 'stopped'
        return result()
      }
      return result()
    }
  })
}

const SITE = { path: ROOT, localStack: 'ddev' as const }

describe('detectDdevStack', () => {
  it('answers plain for a folder with no .ddev', async () => {
    const host = fakeHost({ docker: true, status: 'running' })
    await expect(detectDdevStack('/Users/me/Sites/other', { host })).resolves.toMatchObject({
      stack: 'plain'
    })
  })

  it('reports a stopped project from its files while Docker is down', async () => {
    const calls: string[] = []
    const host = fakeHost({ docker: false, status: 'stopped' }, calls)
    await expect(detectDdevStack(ROOT, { host })).resolves.toMatchObject({
      stack: 'ddev',
      supported: true,
      domain: 'alchemy.ddev.site:8843',
      socketReady: false,
      appRunning: false,
      phpVersion: '8.3'
    })
    expect(calls.some((call) => call.startsWith('ddev'))).toBe(false)
  })

  it('reports a running project from describe', async () => {
    const host = fakeHost({ docker: true, status: 'running' })
    await expect(detectDdevStack(path.join(ROOT, 'wp-content'), { host })).resolves.toMatchObject({
      stack: 'ddev',
      socketReady: true,
      appRunning: true,
      domain: 'alchemy.ddev.site:8843'
    })
  })

  it('marks a non-WordPress project as DDEV but unsupported', async () => {
    const host = fakeHost({ docker: true, status: 'running', type: 'drupal' })
    const detection = await detectDdevStack(ROOT, { host })
    expect(detection.stack).toBe('ddev')
    expect(detection.supported).toBe(false)
    expect(detection.reason).toContain('drupal')
  })
})

describe('ensureDdevSiteRunning', () => {
  it('starts a stopped project and returns live TCP credentials', async () => {
    const calls: string[] = []
    const host = fakeHost({ docker: true, status: 'stopped' }, calls)
    const outcome = await ensureDdevSiteRunning(SITE, undefined, { host })
    expect(outcome).toMatchObject({
      ok: true,
      state: 'started',
      socketPath: '',
      port: 32790,
      user: 'db',
      password: 'db',
      database: 'db'
    })
    expect(calls).toContain('ddev start')
  })

  it('does not restart a running project', async () => {
    const calls: string[] = []
    const host = fakeHost({ docker: true, status: 'running' }, calls)
    await expect(ensureDdevSiteRunning(SITE, undefined, { host })).resolves.toMatchObject({
      state: 'running'
    })
    expect(calls).not.toContain('ddev start')
  })

  it('fails plainly when DDEV starts but its router port answers nothing', async () => {
    const host = fakeHost({ docker: true, status: 'stopped', routerUp: false })
    const outcome = await ensureDdevSiteRunning(SITE, undefined, { host })
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('nothing answers on 127.0.0.1:8843')
  })

  it('fails with the start-Docker message when Docker cannot be started', async () => {
    const host = fakeHost({ docker: false, status: 'stopped' })
    const outcome = await ensureDdevSiteRunning(SITE, undefined, { host })
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('Docker is not running')
  })

  it('skips a folder that is not a DDEV project', async () => {
    const host = fakeHost({ docker: true, status: 'running' })
    await expect(
      ensureDdevSiteRunning({ path: '/Users/me/Sites/other', localStack: 'ddev' }, undefined, {
        host
      })
    ).resolves.toMatchObject({ ok: true, state: 'not-managed' })
  })
})

describe('stop and credentials', () => {
  it('stops a running project', async () => {
    const calls: string[] = []
    const host = fakeHost({ docker: true, status: 'running' }, calls)
    await expect(stopDdevSite(SITE, { host })).resolves.toMatchObject({
      ok: true,
      state: 'stopped'
    })
    expect(calls).toContain('ddev stop')
  })

  it('treats Docker down as already stopped', async () => {
    const calls: string[] = []
    const host = fakeHost({ docker: false, status: 'stopped' }, calls)
    await expect(stopDdevSite(SITE, { host })).resolves.toMatchObject({ ok: true })
    expect(calls).not.toContain('ddev stop')
  })

  it('never starts anything to answer for credentials', async () => {
    const calls: string[] = []
    const stopped = fakeHost({ docker: true, status: 'stopped' }, calls)
    await expect(ddevCredentials(SITE, { host: stopped })).resolves.toBeNull()
    expect(calls).not.toContain('ddev start')
    const running = fakeHost({ docker: true, status: 'running' })
    await expect(ddevCredentials(SITE, { host: running })).resolves.toEqual({
      socketPath: '',
      port: 32790,
      user: 'db',
      password: 'db',
      database: 'db'
    })
  })
})

describe('detection details for the Local card', () => {
  it('carries the URL, docroot and database endpoint, never the password', async () => {
    const host = fakeHost({ docker: true, status: 'running' })
    const detection = await detectDdevStack(ROOT, { host })
    expect(detection).toMatchObject({
      url: 'https://alchemy.ddev.site:8843',
      docroot: '',
      databaseHost: '127.0.0.1',
      databasePort: 32790,
      databaseName: 'db'
    })
    expect(JSON.stringify(detection)).not.toContain('password')
  })

  it('notes Docker being down instead of guessing a state', async () => {
    const host = fakeHost({ docker: false, status: 'stopped' })
    await expect(detectDdevStack(ROOT, { host })).resolves.toMatchObject({
      appRunning: false,
      providerNote: "Docker isn't running."
    })
  })
})

describe('runDdevSetup core download', () => {
  const request = { sitePath: ROOT, domain: 'alchemy.ddev.site' } as Parameters<
    typeof runDdevSetup
  >[0]

  it('leaves core to the import when it will pull server files', async () => {
    const calls: string[] = []
    const host = fakeHost({ docker: true, status: 'stopped' }, calls)
    const outcome = await runDdevSetup(request, { docroot: ROOT, skipCoreDownload: true, host })
    expect(outcome.ok).toBe(true)
    expect(outcome.log).toContain('WordPress core comes with the server files in the import.')
    expect(calls.some((call) => call.startsWith('ddev wp core download'))).toBe(false)
  })

  it('downloads core when nothing else will bring it', async () => {
    const calls: string[] = []
    const host = fakeHost({ docker: true, status: 'stopped' }, calls)
    await runDdevSetup(request, { docroot: ROOT, host })
    expect(calls).toContain('ddev wp core download --skip-content')
  })
})

describe('runDdevSetup project config', () => {
  it('configures a new project on Apache so .htaccess rules apply', async () => {
    const calls: string[] = []
    const host = fakeHost({ docker: true, status: 'stopped' }, calls)
    const fresh = '/Users/me/Sites/fresh'
    await runDdevSetup(
      { sitePath: fresh, domain: 'fresh.ddev.site' } as Parameters<typeof runDdevSetup>[0],
      { docroot: fresh, host }
    )
    const config = calls.find((call) => call.startsWith('ddev config'))
    expect(config).toContain('--webserver-type=apache-fpm')
  })
})
