import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLocalWpHost, type LocalWpHost } from './localwp-host'
import { buildLocalWpWpEnv } from './localwp-wp-cli-environment'

const HOME = '/Users/tester'
const SUPPORT = path.join(HOME, 'Library', 'Application Support', 'Local')
const SERVICES = path.join(SUPPORT, 'lightning-services')
const SITE_ID = 'aBcD1234'
const SOCKET = path.join(SUPPORT, 'run', SITE_ID, 'mysql', 'mysqld.sock')
const CONF = path.join(SUPPORT, 'run', SITE_ID, 'conf')
const WP_CLI = '/Applications/Local.app/Contents/Resources/extraResources/bin/wp-cli/posix'

type World = {
  platform?: string
  existing?: string[]
  services?: string[]
  sitePhp?: string
}

function fakeHost(world: World = {}): LocalWpHost {
  const sites = {
    [SITE_ID]: { path: '/Sites/acme', services: { php: { version: world.sitePhp ?? '8.2.29' } } }
  }
  const existing = new Set([CONF, WP_CLI, ...(world.existing ?? [])])
  return createLocalWpHost({
    platform: world.platform ?? 'darwin',
    homeDir: HOME,
    run: async () => ({ code: 1, stdout: '', stderr: '' }),
    readTextFile: async (filePath) =>
      filePath === path.join(SUPPORT, 'sites.json') ? JSON.stringify(sites) : null,
    pathExists: async (filePath) => existing.has(filePath),
    listDirectory: async (dirPath) => (dirPath === SERVICES ? (world.services ?? []) : []),
    canonicalPath: async (filePath) => filePath,
    isTcpPortOpen: async () => false,
    isMysqlSocketReady: async () => false,
    sleep: async () => {},
    environment: { PATH: '/usr/bin:/bin', HOME }
  })
}

function phpBin(directory: string, arch = 'darwin-arm64'): string {
  return path.join(SERVICES, directory, 'bin', arch, 'bin')
}

describe('buildLocalWpWpEnv', () => {
  it('returns null off darwin', async () => {
    expect(await buildLocalWpWpEnv(fakeHost({ platform: 'linux' }), SOCKET)).toBeNull()
  })

  it('returns null for a socket path that carries no site id', async () => {
    expect(await buildLocalWpWpEnv(fakeHost(), '/tmp/mysql.sock')).toBeNull()
  })

  it("returns null when Local's wp-cli directory is absent", async () => {
    const host = createLocalWpHost({
      ...fakeHost(),
      pathExists: async (filePath) => filePath === CONF
    })
    expect(await buildLocalWpWpEnv(host, SOCKET)).toBeNull()
  })

  it('points PHPRC and MYSQL_HOME at the per-site conf directory and disables xdebug', async () => {
    const env = await buildLocalWpWpEnv(fakeHost(), SOCKET)
    expect(env?.PHPRC).toBe(path.join(CONF, 'php'))
    expect(env?.MYSQL_HOME).toBe(path.join(CONF, 'mysql'))
    expect(env?.XDEBUG_MODE).toBe('off')
    expect(env?.WP_CLI_DISABLE_AUTO_CHECK_UPDATE).toBe('1')
    // The inherited environment survives, with Local's wp-cli prepended.
    expect(env?.HOME).toBe(HOME)
    expect(env?.PATH.startsWith(`${WP_CLI}:`)).toBe(true)
    expect(env?.PATH.endsWith('/usr/bin:/bin')).toBe(true)
  })

  it('sets WP_CLI_CONFIG_PATH only when the bundled config exists', async () => {
    const configPath = path.join(path.dirname(WP_CLI), 'config.yaml')
    expect((await buildLocalWpWpEnv(fakeHost(), SOCKET))?.WP_CLI_CONFIG_PATH).toBeUndefined()
    const withConfig = await buildLocalWpWpEnv(fakeHost({ existing: [configPath] }), SOCKET)
    expect(withConfig?.WP_CLI_CONFIG_PATH).toBe(configPath)
  })

  // PHPRC loads the Xdebug build compiled for the SITE's PHP version; a newer PHP binary against it
  // aborts with "Xdebug requires Zend Engine API version …", so the exact match must win.
  it("prefers the PHP build matching the site's configured version over the newest", async () => {
    const host = fakeHost({
      sitePhp: '8.2.29',
      services: ['php-8.4.1+3', 'php-8.2.29+2', 'php-7.4.30+1'],
      existing: [phpBin('php-8.4.1+3'), phpBin('php-8.2.29+2')]
    })
    const env = await buildLocalWpWpEnv(host, SOCKET)
    expect(env?.PATH.split(':')).toContain(phpBin('php-8.2.29+2'))
    expect(env?.PATH.split(':')).not.toContain(phpBin('php-8.4.1+3'))
  })

  it('falls back to the newest build when no version matches', async () => {
    const host = fakeHost({
      sitePhp: '8.1.0',
      services: ['php-8.4.1+3', 'php-8.2.29+2'],
      existing: [phpBin('php-8.4.1+3'), phpBin('php-8.2.29+2')]
    })
    const env = await buildLocalWpWpEnv(host, SOCKET)
    expect(env?.PATH.split(':')).toContain(phpBin('php-8.4.1+3'))
  })

  it('finds an Intel build when no arm64 build is installed', async () => {
    const host = fakeHost({
      services: ['php-8.2.29+2'],
      existing: [phpBin('php-8.2.29+2', 'darwin-x64')]
    })
    const env = await buildLocalWpWpEnv(host, SOCKET)
    expect(env?.PATH.split(':')).toContain(phpBin('php-8.2.29+2', 'darwin-x64'))
  })

  it('still returns an environment when no PHP build can be located', async () => {
    const env = await buildLocalWpWpEnv(fakeHost({ services: [] }), SOCKET)
    expect(env?.PATH).toBe(`${WP_CLI}:/usr/bin:/bin`)
  })
})
