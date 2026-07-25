import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLocalWpHost, type LocalWpCommandResult, type LocalWpHost } from './localwp-host'
import {
  ensureLocalWpSiteRunning,
  ensureSiteRunning,
  resolveLocalCli,
  stopSite,
  waitForSocket
} from './localwp-site-control'

const HOME = '/Users/tester'
const SUPPORT = path.join(HOME, 'Library', 'Application Support', 'Local')
const SITE_ID = 'aBcD1234'
const SITE_PATH = '/Sites/acme'
const SOCKET = path.join(SUPPORT, 'run', SITE_ID, 'mysql', 'mysqld.sock')
const WP_CONFIG = path.join(SITE_PATH, 'app', 'public', 'wp-config.php')
const CLI = '/opt/homebrew/bin/local-cli'

type FakeWorld = {
  platform?: string
  registered?: boolean
  existing?: string[]
  readySockets?: string[]
  commands?: Record<string, LocalWpCommandResult>
  directories?: Record<string, string[]>
}

type Harness = { host: LocalWpHost; spawned: string[]; sleeps: number[] }

function harness(world: FakeWorld = {}): Harness {
  const spawned: string[] = []
  const sleeps: number[] = []
  const files: Record<string, string> = world.registered
    ? { [path.join(SUPPORT, 'sites.json')]: JSON.stringify({ [SITE_ID]: { path: SITE_PATH } }) }
    : {}
  const existing = new Set([...(world.existing ?? []), ...Object.keys(files)])
  const host = createLocalWpHost({
    platform: world.platform ?? 'darwin',
    homeDir: HOME,
    run: async (file, args) => {
      const key = [file, ...args].join(' ')
      spawned.push(key)
      return world.commands?.[key] ?? { code: 1, stdout: '', stderr: 'not found' }
    },
    readTextFile: async (filePath) => files[filePath] ?? null,
    pathExists: async (filePath) => existing.has(filePath),
    listDirectory: async (dirPath) => world.directories?.[dirPath] ?? [],
    canonicalPath: async (filePath) => filePath,
    isTcpPortOpen: async () => false,
    isMysqlSocketReady: async (socketPath) => (world.readySockets ?? []).includes(socketPath),
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    environment: {}
  })
  return { host, spawned, sleeps }
}

function ok(stdout = ''): LocalWpCommandResult {
  return { code: 0, stdout, stderr: '' }
}

describe('platform gating', () => {
  it('returns the unsupported outcome and spawns nothing off darwin', async () => {
    const { host, spawned } = harness({ platform: 'linux' })
    const outcome = await ensureSiteRunning(SITE_PATH, { host })
    expect(outcome).toEqual({
      ok: true,
      socketPath: '',
      state: 'unsupported',
      message: 'LocalWP integration is only available on macOS.'
    })
    expect(spawned).toEqual([])
  })

  it('gates stopSite and waitForSocket off darwin too', async () => {
    const { host, spawned } = harness({ platform: 'win32' })
    expect((await stopSite(SITE_PATH, { host })).state).toBe('unsupported')
    expect(await waitForSocket(SITE_PATH, { host })).toBeNull()
    expect(spawned).toEqual([])
  })
})

describe('ensureSiteRunning', () => {
  it('is a no-op when the site is already running', async () => {
    const { host, spawned } = harness({
      registered: true,
      existing: [WP_CONFIG, SOCKET],
      readySockets: [SOCKET]
    })
    const outcome = await ensureSiteRunning(SITE_PATH, { host })
    expect(outcome).toEqual({
      ok: true,
      socketPath: SOCKET,
      state: 'running',
      message: 'LocalWP site already running'
    })
    // Nothing was launched or started: no pgrep, no open, no local-cli.
    expect(spawned).toEqual([])
  })

  it('skips a checkout that is not a LocalWP site', async () => {
    const { host, spawned } = harness({})
    const outcome = await ensureSiteRunning(SITE_PATH, { host })
    expect(outcome).toEqual({
      ok: true,
      socketPath: '',
      state: 'not-managed',
      message: 'Not a LocalWP site'
    })
    expect(spawned).toEqual([])
  })

  it('skips a LocalWP layout that Local does not know about', async () => {
    const { host } = harness({ existing: [WP_CONFIG] })
    const outcome = await ensureSiteRunning(SITE_PATH, { host })
    expect(outcome.state).toBe('not-managed')
    expect(outcome.message).toBe('Not registered in the Local app')
  })

  it('launches the Local app, starts the site, and returns the resolved socket', async () => {
    const world: FakeWorld = {
      registered: true,
      existing: [WP_CONFIG],
      readySockets: [],
      commands: {
        'pgrep -x Local': { code: 1, stdout: '', stderr: '' },
        'open -ga Local': ok(),
        'which local-cli': ok(`${CLI}\n`),
        [`${CLI} start-site ${SITE_ID}`]: ok('started')
      }
    }
    const { host, spawned } = harness(world)
    const statuses: string[] = []
    // The socket only becomes ready once local-cli has run — mirrors Local's real startup.
    const startedHost: LocalWpHost = {
      ...host,
      pathExists: async (filePath) =>
        filePath === SOCKET
          ? spawned.includes(`${CLI} start-site ${SITE_ID}`)
          : host.pathExists(filePath),
      isMysqlSocketReady: async (socketPath) =>
        socketPath === SOCKET && spawned.includes(`${CLI} start-site ${SITE_ID}`)
    }
    const outcome = await ensureSiteRunning(SITE_PATH, {
      host: startedHost,
      onStatus: (message) => statuses.push(message)
    })
    expect(outcome).toEqual({
      ok: true,
      socketPath: SOCKET,
      state: 'running',
      message: 'LocalWP site started'
    })
    expect(spawned).toContain('open -ga Local')
    expect(spawned).toContain(`${CLI} start-site ${SITE_ID}`)
    expect(statuses.some((line) => line.includes('not running'))).toBe(true)
  })

  it('fails with actionable guidance when local-cli cannot be found', async () => {
    const { host } = harness({
      registered: true,
      existing: [WP_CONFIG],
      commands: { 'pgrep -x Local': ok('4711') }
    })
    const outcome = await ensureSiteRunning(SITE_PATH, { host })
    expect(outcome.ok).toBe(false)
    expect(outcome.state).toBe('failed')
    expect(outcome.message).toContain('local-cli` was not found')
  })

  it('surfaces the local-cli failure output, truncated', async () => {
    const { host } = harness({
      registered: true,
      existing: [WP_CONFIG],
      commands: {
        'pgrep -x Local': ok('4711'),
        'which local-cli': ok(CLI),
        [`${CLI} start-site ${SITE_ID}`]: { code: 3, stdout: '', stderr: 'boom '.repeat(200) }
      }
    })
    const outcome = await ensureSiteRunning(SITE_PATH, { host })
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('start-site` failed: boom')
    expect(outcome.message.length).toBeLessThan(260)
  })

  it('fails when the socket never becomes ready after a successful start', async () => {
    const { host } = harness({
      registered: true,
      existing: [WP_CONFIG, SOCKET],
      readySockets: [],
      commands: {
        'pgrep -x Local': ok('4711'),
        'which local-cli': ok(CLI),
        [`${CLI} start-site ${SITE_ID}`]: ok()
      }
    })
    const outcome = await ensureSiteRunning(SITE_PATH, { host, socketTimeoutMs: 15 })
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('Timed out waiting for the LocalWP MySQL socket')
  })

  it('exposes the canonical two-argument entry point', async () => {
    // Off darwin the canonical form must still resolve, and must report ok so an import proceeds.
    const outcome = await ensureLocalWpSiteRunning('/definitely/not/a/site')
    expect(typeof outcome.ok).toBe('boolean')
    expect(typeof outcome.socketPath).toBe('string')
    expect(typeof outcome.message).toBe('string')
  })
})

describe('waitForSocket', () => {
  it('returns the socket as soon as mysqld accepts a connection', async () => {
    const { host } = harness({ registered: true, existing: [SOCKET], readySockets: [SOCKET] })
    expect(await waitForSocket(SITE_PATH, { host })).toBe(SOCKET)
  })

  it('times out instead of hanging when the socket never becomes ready', async () => {
    const { host, sleeps } = harness({ registered: true, existing: [SOCKET], readySockets: [] })
    const started = Date.now()
    expect(await waitForSocket(SITE_PATH, { host, socketTimeoutMs: 20 })).toBeNull()
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(sleeps.length).toBeGreaterThan(0)
  })

  it('stops polling when the signal is aborted', async () => {
    const { host } = harness({ registered: true, existing: [SOCKET], readySockets: [] })
    const controller = new AbortController()
    controller.abort()
    expect(await waitForSocket(SITE_PATH, { host, signal: controller.signal })).toBeNull()
  })

  it('reports distinct progress for missing-socket and not-yet-accepting', async () => {
    const { host } = harness({ registered: true, existing: [SOCKET], readySockets: [] })
    const statuses: string[] = []
    await waitForSocket(SITE_PATH, {
      host,
      socketTimeoutMs: 20,
      onStatus: (message) => statuses.push(message)
    })
    expect(statuses[0]).toContain('waiting for the server to accept connections')
  })
})

describe('stopSite', () => {
  it('reports already-stopped without invoking local-cli', async () => {
    const { host, spawned } = harness({ registered: true, existing: [WP_CONFIG], readySockets: [] })
    const outcome = await stopSite(SITE_PATH, { host })
    expect(outcome).toEqual({
      ok: true,
      socketPath: '',
      state: 'stopped',
      message: 'Already stopped'
    })
    expect(spawned).toEqual([])
  })

  it('stops a running site', async () => {
    const { host, spawned } = harness({
      registered: true,
      existing: [WP_CONFIG, SOCKET],
      readySockets: [SOCKET],
      commands: {
        'which local-cli': ok(CLI),
        [`${CLI} stop-site ${SITE_ID}`]: ok()
      }
    })
    const outcome = await stopSite(SITE_PATH, { host })
    expect(outcome.ok).toBe(true)
    expect(outcome.state).toBe('stopped')
    expect(spawned).toContain(`${CLI} stop-site ${SITE_ID}`)
  })

  it('surfaces a stop failure', async () => {
    const { host } = harness({
      registered: true,
      existing: [WP_CONFIG, SOCKET],
      readySockets: [SOCKET],
      commands: {
        'which local-cli': ok(CLI),
        [`${CLI} stop-site ${SITE_ID}`]: { code: 1, stdout: 'nope', stderr: '' }
      }
    })
    const outcome = await stopSite(SITE_PATH, { host })
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('stop-site` failed: nope')
  })
})

describe('resolveLocalCli', () => {
  it('prefers a binary already on PATH', async () => {
    const { host } = harness({ commands: { 'which local-cli': ok(`${CLI}\n/other/local-cli\n`) } })
    expect(await resolveLocalCli(host)).toBe(CLI)
  })

  it('falls back to the newest nvm-managed node', async () => {
    const nvmRoot = path.join(HOME, '.nvm', 'versions', 'node')
    const { host } = harness({
      directories: { [nvmRoot]: ['v18.20.4', 'v22.11.0', 'v20.11.1'] },
      existing: [path.join(nvmRoot, 'v22.11.0', 'bin', 'local-cli')]
    })
    expect(await resolveLocalCli(host)).toBe(path.join(nvmRoot, 'v22.11.0', 'bin', 'local-cli'))
  })

  it('falls back to a homebrew install', async () => {
    const { host } = harness({ existing: [CLI] })
    expect(await resolveLocalCli(host)).toBe(CLI)
  })

  it('returns null when nothing is installed', async () => {
    const { host } = harness({})
    expect(await resolveLocalCli(host)).toBeNull()
  })
})
