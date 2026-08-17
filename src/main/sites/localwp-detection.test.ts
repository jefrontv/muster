import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  currentSocketIfRunning,
  detectLocalWpStack,
  findLocalWpSiteId,
  isLocalWpAppRunning,
  isSiteRegisteredWithLocalWp,
  listLocalWpListenPorts,
  readLocalWpConnectionInfo,
  readSitePhpVersion,
  resolveGraphqlEndpointCandidates,
  resolveLocalWpServiceVersion,
  siteIdFromSocketPath
} from './localwp-detection'
import { createLocalWpHost, type LocalWpCommandResult, type LocalWpHost } from './localwp-host'

const HOME = '/Users/tester'
const SUPPORT = path.join(HOME, 'Library', 'Application Support', 'Local')
const SITE_ID = 'aBcD1234'
const SITE_PATH = '/Sites/acme'
const SOCKET = path.join(SUPPORT, 'run', SITE_ID, 'mysql', 'mysqld.sock')

type FakeWorld = {
  platform?: string
  files?: Record<string, string>
  directories?: Record<string, string[]>
  existing?: string[]
  commands?: Record<string, LocalWpCommandResult>
  openPorts?: number[]
  readySockets?: string[]
}

const spawned: string[] = []

function fakeHost(world: FakeWorld = {}): LocalWpHost {
  const files = world.files ?? {}
  const existing = new Set([...(world.existing ?? []), ...Object.keys(files)])
  return createLocalWpHost({
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
    canonicalPath: async (filePath) => filePath.replace(/\/+$/, ''),
    isTcpPortOpen: async (port) => (world.openPorts ?? []).includes(port),
    isMysqlSocketReady: async (socketPath) => (world.readySockets ?? []).includes(socketPath),
    sleep: async () => {},
    environment: { PATH: '/usr/bin' }
  })
}

function sitesJson(entries: Record<string, unknown>): Record<string, string> {
  return { [path.join(SUPPORT, 'sites.json')]: JSON.stringify(entries) }
}

describe('platform gating', () => {
  it('reports the app as not running and spawns nothing off darwin', async () => {
    spawned.length = 0
    const host = fakeHost({ platform: 'linux', commands: { 'pgrep -x Local': ok('123') } })
    expect(await isLocalWpAppRunning(host)).toBe(false)
    expect(await listLocalWpListenPorts(host)).toEqual([])
    expect(await readLocalWpConnectionInfo(host)).toBeNull()
    expect(spawned).toEqual([])
  })

  it('returns a structured unsupported detection off darwin without reading anything', async () => {
    spawned.length = 0
    const detection = await detectLocalWpStack(fakeHost({ platform: 'win32' }), SITE_PATH)
    expect(detection.supported).toBe(false)
    expect(detection.reason).toContain('macOS')
    expect(detection.stack).toBe('plain')
    expect(detection.socketPath).toBe('')
    expect(spawned).toEqual([])
  })

  it('finds no registered site off darwin even when sites.json matches', async () => {
    const world = { platform: 'linux', files: sitesJson({ [SITE_ID]: { path: SITE_PATH } }) }
    expect(await findLocalWpSiteId(fakeHost(world), SITE_PATH)).toBeNull()
  })
})

describe('app detection', () => {
  it('treats a zero pgrep exit as running', async () => {
    const host = fakeHost({ commands: { 'pgrep -x Local': ok('4711') } })
    expect(await isLocalWpAppRunning(host)).toBe(true)
  })

  it('treats a nonzero pgrep exit as not running', async () => {
    expect(await isLocalWpAppRunning(fakeHost())).toBe(false)
  })
})

describe('graphql endpoint discovery', () => {
  const LSOF = 'lsof -nP -iTCP -sTCP:LISTEN -a -p 4711'

  it('reads the port and token from connection info', async () => {
    const host = fakeHost({
      files: {
        [path.join(SUPPORT, 'graphql-connection-info.json')]: JSON.stringify({
          port: 5123,
          authToken: 'secret-token'
        })
      }
    })
    expect(await readLocalWpConnectionInfo(host)).toEqual({ port: 5123, authToken: 'secret-token' })
  })

  it('parses lsof listen lines and de-duplicates ports', async () => {
    const host = fakeHost({
      commands: {
        'pgrep -x Local': ok('4711'),
        [LSOF]: ok(
          [
            'Local 4711 tester 30u IPv4 0x1 0t0 TCP 127.0.0.1:4000 (LISTEN)',
            'Local 4711 tester 31u IPv6 0x2 0t0 TCP [::1]:4000 (LISTEN)',
            'Local 4711 tester 32u IPv4 0x3 0t0 TCP 127.0.0.1:52111 (LISTEN)',
            'Local 4711 tester 33u IPv4 0x4 0t0 TCP 127.0.0.1:1234 (ESTABLISHED)'
          ].join('\n')
        )
      }
    })
    expect(await listLocalWpListenPorts(host)).toEqual([4000, 52111])
  })

  it('drops a stale advertised port that refuses a connection', async () => {
    const host = fakeHost({
      commands: {
        'pgrep -x Local': ok('4711'),
        [LSOF]: ok('Local 4711 t 30u TCP 127.0.0.1:5200 (LISTEN)')
      },
      openPorts: [5200]
    })
    const endpoints = await resolveGraphqlEndpointCandidates(host, { port: 4999, authToken: '' })
    expect(endpoints).toEqual([{ url: 'http://127.0.0.1:5200/graphql', port: 5200 }])
  })

  it('always considers the historical default port last', async () => {
    const host = fakeHost({ commands: { 'pgrep -x Local': ok('') }, openPorts: [4000] })
    const endpoints = await resolveGraphqlEndpointCandidates(host, { port: null, authToken: '' })
    expect(endpoints.map((entry) => entry.port)).toEqual([4000])
  })
})

describe('service versions', () => {
  it('picks the newest build and strips its +N suffix', async () => {
    const host = fakeHost({
      directories: {
        [path.join(SUPPORT, 'lightning-services')]: [
          'apache-2.4.43+11',
          'apache-2.4.39+8',
          'php-8.2.29+2',
          'mysql-8.0.16+6'
        ]
      }
    })
    expect(await resolveLocalWpServiceVersion(host, 'apache')).toBe('apache-2.4.43')
  })

  it('returns null when the service is not installed', async () => {
    expect(await resolveLocalWpServiceVersion(fakeHost(), 'apache')).toBeNull()
  })
})

describe('socket resolution from a site path', () => {
  it('extracts the site id from a socket path', () => {
    expect(siteIdFromSocketPath(SOCKET)).toBe(SITE_ID)
    expect(siteIdFromSocketPath('/tmp/mysql.sock')).toBeNull()
  })

  it('matches a registered site by resolved path and derives its socket', async () => {
    const host = fakeHost({
      files: sitesJson({ other: { path: '/Sites/other' }, [SITE_ID]: { path: `${SITE_PATH}/` } }),
      existing: [SOCKET],
      readySockets: [SOCKET]
    })
    expect(await findLocalWpSiteId(host, SITE_PATH)).toBe(SITE_ID)
    expect(await isSiteRegisteredWithLocalWp(host, SITE_PATH)).toBe(true)
    expect(await currentSocketIfRunning(host, SITE_PATH)).toBe(SOCKET)
  })

  it('withholds the socket when the file exists but mysqld refuses connections', async () => {
    const host = fakeHost({
      files: sitesJson({ [SITE_ID]: { path: SITE_PATH } }),
      existing: [SOCKET],
      readySockets: []
    })
    expect(await currentSocketIfRunning(host, SITE_PATH)).toBeNull()
  })

  it('withholds the socket when the file is absent', async () => {
    const host = fakeHost({
      files: sitesJson({ [SITE_ID]: { path: SITE_PATH } }),
      readySockets: [SOCKET]
    })
    expect(await currentSocketIfRunning(host, SITE_PATH)).toBeNull()
  })

  it('survives a corrupt sites.json', async () => {
    const host = fakeHost({ files: { [path.join(SUPPORT, 'sites.json')]: '{ not json' } })
    expect(await findLocalWpSiteId(host, SITE_PATH)).toBeNull()
  })

  it('ignores registry entries without a path', async () => {
    const host = fakeHost({ files: sitesJson({ [SITE_ID]: { path: '' }, broken: 7 }) })
    expect(await findLocalWpSiteId(host, SITE_PATH)).toBeNull()
  })
})

describe('php version', () => {
  it('reads the site-configured version', async () => {
    const host = fakeHost({
      files: sitesJson({ [SITE_ID]: { path: SITE_PATH, services: { php: { version: '8.2.29' } } } })
    })
    expect(await readSitePhpVersion(host, SITE_ID)).toBe('8.2.29')
  })

  it('returns null when the services block is missing', async () => {
    const host = fakeHost({ files: sitesJson({ [SITE_ID]: { path: SITE_PATH } }) })
    expect(await readSitePhpVersion(host, SITE_ID)).toBeNull()
  })
})

describe('stack detection', () => {
  it('reports a registered, running LocalWP site', async () => {
    const host = fakeHost({
      commands: { 'pgrep -x Local': ok('4711') },
      files: sitesJson({
        [SITE_ID]: {
          path: SITE_PATH,
          domain: 'acme.local',
          services: { php: { version: '8.3.0' } }
        }
      }),
      existing: [SOCKET, path.join(SITE_PATH, 'app', 'public', 'wp-config.php')],
      readySockets: [SOCKET]
    })
    expect(await detectLocalWpStack(host, SITE_PATH)).toEqual({
      supported: true,
      reason: '',
      stack: 'localwp',
      appRunning: true,
      registered: true,
      siteId: SITE_ID,
      domain: 'acme.local',
      socketPath: SOCKET,
      socketReady: true,
      phpVersion: '8.3.0'
    })
  })

  it('reports an unregistered checkout with a LocalWP layout as localwp but stopped', async () => {
    const host = fakeHost({
      existing: [path.join(SITE_PATH, 'app', 'public', 'wp-config.php')]
    })
    const detection = await detectLocalWpStack(host, SITE_PATH)
    expect(detection.stack).toBe('localwp')
    expect(detection.registered).toBe(false)
    expect(detection.socketReady).toBe(false)
  })

  it('reports a plain checkout as plain', async () => {
    const detection = await detectLocalWpStack(fakeHost(), SITE_PATH)
    expect(detection.stack).toBe('plain')
    expect(detection.supported).toBe(true)
  })
})

function ok(stdout: string): LocalWpCommandResult {
  return { code: 0, stdout, stderr: '' }
}
