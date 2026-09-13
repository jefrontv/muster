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
/** Local creates this directory itself, and a relocated project's files land inside it. */
const APP_PUBLIC = path.join(SITE_PATH, 'app', 'public')
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

  it('skips a folder with no LocalWP footprint at all, accurately and without waiting', async () => {
    const { host, spawned, sleeps } = harness({})
    const outcome = await ensureSiteRunning(SITE_PATH, { host })
    expect(outcome.ok).toBe(true)
    expect(outcome.state).toBe('not-managed')
    // The accurate, immediate answer — not prompt advice for a folder Local has never seen.
    expect(outcome.message).toBe('Not a LocalWP site')
    expect(outcome.message).not.toContain('password prompt')
    expect(sleeps).toEqual([])
    expect(spawned).toEqual([])
  })

  it('waits out a LocalWP layout Local does not list yet, then names the prompt', async () => {
    const { host, sleeps } = harness({ existing: [WP_CONFIG] })
    const outcome = await ensureSiteRunning(SITE_PATH, { host, registrationTimeoutMs: 25 })
    expect(sleeps.length).toBeGreaterThan(0)
    expect(outcome.state).toBe('not-managed')
    expect(outcome.message).toContain('LocalWP never reported this folder')
    expect(outcome.message).toContain('password prompt')
  })

  it('answers a LocalWP-shaped folder instantly and accurately when the caller did not wait', async () => {
    // The default is no wait: siteStacks:start/stop and the import pipeline render no "Change and
    // retry" control, so prompt advice would be an instruction they cannot follow.
    const { host, sleeps } = harness({ existing: [WP_CONFIG] })
    const outcome = await ensureSiteRunning(SITE_PATH, { host })
    expect(sleeps).toEqual([])
    expect(outcome.state).toBe('not-managed')
    expect(outcome.message).toBe('Not registered in the Local app')
    expect(outcome.message).not.toContain('password prompt')
    expect(outcome.message).not.toContain('Change and retry')
  })

  it('waits for Local to list a site it has not registered yet, then proceeds', async () => {
    // The reported regression: the wizard's own create leaves app/public full and no wp-config.php,
    // and Local has not written the registry entry yet. Ticks 1 and 2 answer null; the 3rd registers.
    const reads: number[] = []
    const base = harness({ existing: [APP_PUBLIC, SOCKET], readySockets: [SOCKET] })
    let registryReads = 0
    const host: LocalWpHost = {
      ...base.host,
      readTextFile: async (filePath) => {
        if (filePath !== path.join(SUPPORT, 'sites.json')) {
          return null
        }
        registryReads += 1
        reads.push(registryReads)
        return registryReads >= 3 ? JSON.stringify({ [SITE_ID]: { path: SITE_PATH } }) : '{}'
      }
    }
    const statuses: string[] = []
    const outcome = await ensureSiteRunning(SITE_PATH, {
      host,
      registrationTimeoutMs: 60_000,
      onStatus: (message) => statuses.push(message)
    })
    expect(reads.length).toBeGreaterThanOrEqual(3)
    expect(outcome.state).toBe('running')
    expect(outcome.socketPath).toBe(SOCKET)
    expect(statuses.some((line) => line.includes('Waiting for LocalWP to finish setting up'))).toBe(
      true
    )
    expect(statuses.some((line) => line.includes('answer it'))).toBe(true)
  })

  it('never refuses while the registry is still filling in — it spends the wait first', async () => {
    const { host, sleeps } = harness({ existing: [APP_PUBLIC] })
    const outcome = await ensureSiteRunning(SITE_PATH, { host, registrationTimeoutMs: 25 })
    expect(sleeps.length).toBeGreaterThan(0)
    expect(outcome.state).toBe('not-managed')
    expect(outcome.message).toContain('LocalWP never reported this folder')
  })

  it('names the domain in the exhausted message when the caller knows it', async () => {
    const { host } = harness({ existing: [APP_PUBLIC] })
    const outcome = await ensureSiteRunning(SITE_PATH, {
      host,
      domain: 'polar-frontiers.local',
      registrationTimeoutMs: 20
    })
    expect(outcome.state).toBe('not-managed')
    expect(outcome.message).toContain('LocalWP never reported polar-frontiers.local')
    expect(outcome.message).toContain('press "Change and retry"')
  })

  it('accepts a registered site that has no wp-config.php — the create-mode end state', async () => {
    const { host, spawned } = harness({
      registered: true,
      existing: [APP_PUBLIC, SOCKET],
      readySockets: [SOCKET]
    })
    const outcome = await ensureSiteRunning(SITE_PATH, { host })
    expect(outcome).toEqual({
      ok: true,
      socketPath: SOCKET,
      state: 'running',
      message: 'LocalWP site already running'
    })
    expect(spawned).toEqual([])
  })

  it('stops polling for the registry when the signal is aborted', async () => {
    const { host } = harness({ existing: [APP_PUBLIC] })
    const controller = new AbortController()
    controller.abort()
    const outcome = await ensureSiteRunning(SITE_PATH, { host, signal: controller.signal })
    expect(outcome.ok).toBe(false)
    expect(outcome.state).toBe('failed')
    expect(outcome.message).toContain('Cancelled while waiting for LocalWP')
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
  it('stops a registered site that has no wp-config.php yet', async () => {
    // Same create-mode shape as the ensure case: registered, app/public populated, no core.
    const { host, spawned } = harness({
      registered: true,
      existing: [APP_PUBLIC],
      readySockets: []
    })
    const outcome = await stopSite(SITE_PATH, { host })
    expect(outcome.state).toBe('stopped')
    expect(outcome.message).toBe('Already stopped')
    expect(spawned).toEqual([])
  })

  it('spends the registry wait before refusing, and names the prompt', async () => {
    const { host, sleeps } = harness({ existing: [APP_PUBLIC] })
    const outcome = await stopSite(SITE_PATH, { host, registrationTimeoutMs: 25 })
    expect(sleeps.length).toBeGreaterThan(0)
    expect(outcome.state).toBe('not-managed')
    expect(outcome.message).toContain('LocalWP never reported this folder')
    expect(outcome.message).toContain('password prompt')
  })

  it('answers a LocalWP-shaped folder instantly and accurately when the caller did not wait', async () => {
    // Same distinction the ensure path draws: no wait was spent, so no prompt advice.
    const { host, sleeps } = harness({ existing: [WP_CONFIG] })
    const outcome = await stopSite(SITE_PATH, { host })
    expect(sleeps).toEqual([])
    expect(outcome.state).toBe('not-managed')
    expect(outcome.message).toBe('Not registered in the Local app')
    expect(outcome.message).not.toContain('Change and retry')
  })

  it('answers a folder Local never touched accurately, with no prompt advice', async () => {
    const { host, sleeps, spawned } = harness({})
    const outcome = await stopSite(SITE_PATH, { host })
    expect(outcome.state).toBe('not-managed')
    expect(outcome.message).toBe('Not a LocalWP site')
    expect(outcome.message).not.toContain('password prompt')
    expect(sleeps).toEqual([])
    expect(spawned).toEqual([])
  })

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
