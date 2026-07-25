import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteCheck, SiteCheckName } from '../../shared/site-tool-types'
import { SiteRunStepError, type SiteSshSession } from './pipeline-contract'
import { checkSiteConnection, classifySshFailure } from './site-connection-health'
import { probeLiveSite, probeTlsCertificate } from './site-http-probe'
import {
  createFakeSshSession,
  createToolConfig,
  type FakeExecHandler
} from './site-tool-test-fixtures'
import type * as SiteHttpProbeModule from './site-http-probe'

// The probes reach the public internet; only their contribution to the report is under test here.
vi.mock('./site-http-probe', async (importOriginal) => ({
  ...(await importOriginal<typeof SiteHttpProbeModule>()),
  probeLiveSite: vi.fn(),
  probeTlsCertificate: vi.fn()
}))

const probeLiveSiteMock = vi.mocked(probeLiveSite)
const probeTlsMock = vi.mocked(probeTlsCertificate)

const REMOTE_DB_PASSWORD = 'remote-db-password'
const WP_CONFIG = [
  '<?php',
  "define('DB_NAME', 'acme_prod');",
  "define('DB_USER', 'acme_user');",
  `define('DB_PASSWORD', '${REMOTE_DB_PASSWORD}');`,
  "define('DB_HOST', 'localhost');",
  "$table_prefix = 'wp_';"
].join('\n')

let wpDir: string

beforeEach(() => {
  wpDir = mkdtempSync(path.join(tmpdir(), 'muster-health-'))
  probeLiveSiteMock.mockResolvedValue({
    check: 'http-reachable',
    outcome: 'ok',
    detail: 'GET https://acme.com.au → 200'
  })
  probeTlsMock.mockResolvedValue({
    check: 'tls-certificate',
    outcome: 'ok',
    detail: 'acme.com.au expires in 60 day(s)'
  })
})

afterEach(() => {
  rmSync(wpDir, { recursive: true, force: true })
})

/** Every remote probe answers successfully; individual tests override the one they care about. */
const healthyRemote: FakeExecHandler = (command) => {
  if (command.startsWith('test -r')) {
    return { code: 0 }
  }
  if (command.includes('cat wp-config.php')) {
    return { stdout: WP_CONFIG }
  }
  if (command.startsWith('mysql --defaults-extra-file=')) {
    return { stdout: '1\n' }
  }
  if (command.startsWith('df -P')) {
    return { stdout: '/dev/sda1 100000 40000 60000 41% /home/deploy\n' }
  }
  return undefined
}

function checkNames(checks: SiteCheck[]): SiteCheckName[] {
  return checks.map((check) => check.check)
}

function detailOf(checks: SiteCheck[], name: SiteCheckName): string {
  return checks.find((check) => check.check === name)?.detail ?? ''
}

type ProbeOptions = {
  handler?: FakeExecHandler
  includeLiveSite?: boolean
  localDatabaseError?: string
  openSession?: () => Promise<SiteSshSession>
  liveDomain?: string
}

async function probe(options: ProbeOptions = {}) {
  const fake = createFakeSshSession(options.handler ?? healthyRemote)
  const config = createToolConfig(wpDir, {
    environment: options.liveDomain === undefined ? {} : { liveDomain: options.liveDomain }
  })
  // A real signal, so the live-site checks can assert that cancellation reaches them.
  const controller = new AbortController()
  const report = await checkSiteConnection({
    config,
    openSession: options.openSession ?? (async () => fake.session),
    includeLiveSite: options.includeLiveSite ?? false,
    signal: controller.signal,
    checkLocalDatabase: async () => {
      if (options.localDatabaseError) {
        throw new SiteRunStepError('local-mysql', options.localDatabaseError)
      }
    }
  })
  return { report, fake, signal: controller.signal }
}

describe('classifySshFailure', () => {
  it.each([
    ['All configured authentication methods failed'],
    ['Permission denied (publickey,password)'],
    ['keyboard-interactive authentication failed']
  ])('reads %s as a credential problem', (detail) => {
    expect(classifySshFailure(detail)).toBe('auth')
  })

  it.each([
    ['connect ETIMEDOUT 203.0.113.4:22'],
    ['getaddrinfo ENOTFOUND srv.example.com'],
    ['connect ECONNREFUSED 127.0.0.1:22'],
    ['Client network socket disconnected before secure TLS connection']
  ])('reads %s as an unreachable host', (detail) => {
    expect(classifySshFailure(detail)).toBe('unreachable')
  })
})

describe('checkSiteConnection failure classification', () => {
  it('distinguishes a rejected credential from an unreachable host', async () => {
    const authFailure = await probe({
      openSession: () => {
        throw new SiteRunStepError('ssh-connect', 'All configured authentication methods failed')
      }
    })
    expect(authFailure.report).toMatchObject({ ok: false, failure: 'auth', failedCount: 1 })

    const unreachable = await probe({
      openSession: () => {
        throw new SiteRunStepError('ssh-connect', 'connect ETIMEDOUT 203.0.113.4:22')
      }
    })
    expect(unreachable.report).toMatchObject({ ok: false, failure: 'unreachable' })
    // Nothing past the connection is probed, so the report is one check long, not eight.
    expect(checkNames(unreachable.report.checks)).toEqual(['ssh-connect'])
  })

  it('reports a mistyped root path as wrong-path, not as a database problem', async () => {
    const { report } = await probe({
      handler: (command) => (command.startsWith('test -r') ? { code: 1 } : healthyRemote(command))
    })
    expect(report.failure).toBe('wrong-path')
    expect(detailOf(report.checks, 'wp-config-readable')).toContain('root path')
    // The database checks are skipped entirely: there is no wp-config to read credentials from.
    expect(checkNames(report.checks)).not.toContain('remote-db-credentials')
  })

  it('does not open a connection at all when the environment has no host', async () => {
    let opened = false
    const config = createToolConfig(wpDir, { environment: { hostname: '', username: '' } })
    const report = await checkSiteConnection({
      config,
      openSession: async () => {
        opened = true
        return createFakeSshSession().session
      },
      includeLiveSite: false,
      checkLocalDatabase: async () => undefined
    })
    expect(opened).toBe(false)
    expect(report).toMatchObject({ ok: false, failure: 'missing-credentials' })
  })

  it.each([
    ['unparseable credentials', '<?php\n// nothing here\n'],
    ['a wp-config with no DB_USER', "<?php\ndefine('DB_NAME', 'acme');"]
  ])('classifies %s as a remote database problem', async (_label, contents) => {
    const { report } = await probe({
      handler: (command) =>
        command.includes('cat wp-config.php') ? { stdout: contents } : healthyRemote(command)
    })
    expect(report.failure).toBe('remote-database')
  })

  it('classifies a failing SELECT 1 as a remote database problem', async () => {
    const { report } = await probe({
      handler: (command) =>
        command.startsWith('mysql --defaults-extra-file=')
          ? { code: 1, stderr: 'ERROR 1045 (28000): Access denied' }
          : healthyRemote(command)
    })
    expect(report.failure).toBe('remote-database')
    expect(detailOf(report.checks, 'remote-db-ping')).toContain('Access denied')
  })

  it('flags a nearly full disk without calling it a connection failure', async () => {
    const { report } = await probe({
      handler: (command) =>
        command.startsWith('df -P')
          ? { stdout: '/dev/sda1 100000 97000 3000 97% /home/deploy\n' }
          : healthyRemote(command)
    })
    expect(report.failure).toBe('disk-space')
    expect(detailOf(report.checks, 'disk-space')).toBe('97% used at /home/deploy')
  })

  it('classifies a local MySQL failure as local-database', async () => {
    const { report } = await probe({ localDatabaseError: 'Cannot connect to local MySQL' })
    expect(report.failure).toBe('local-database')
  })
})

describe('checkSiteConnection success path', () => {
  it('runs every remote check, closes the session, and reports ok', async () => {
    const { report, fake } = await probe()
    expect(report).toMatchObject({ ok: true, failure: null, failedCount: 0, environment: 'main' })
    expect(checkNames(report.checks)).toEqual([
      'ssh-connect',
      'wp-config-readable',
      'remote-db-credentials',
      'remote-db-ping',
      'disk-space',
      'local-db-login'
    ])
    expect(fake.closed).toBe(1)
  })

  it('authenticates the remote ping through a 0600 option file, never through argv', async () => {
    const { report, fake } = await probe()
    expect(report.ok).toBe(true)
    expect(fake.secureFiles).toHaveLength(1)
    expect(fake.secureFiles[0].contents).toContain(REMOTE_DB_PASSWORD)
    // The credentials file is always cleaned up, and the password never reaches a command line.
    expect(fake.removed).toEqual([fake.secureFiles[0].path])
    for (const command of fake.commands) {
      expect(command).not.toContain(REMOTE_DB_PASSWORD)
    }
  })

  it('keeps the remote database password out of every reported detail', async () => {
    const { report } = await probe({
      handler: (command) =>
        command.startsWith('mysql --defaults-extra-file=')
          ? { code: 1, stderr: `Access denied using password ${REMOTE_DB_PASSWORD}` }
          : healthyRemote(command)
    })
    for (const check of report.checks) {
      expect(check.detail).not.toContain(REMOTE_DB_PASSWORD)
    }
    expect(detailOf(report.checks, 'remote-db-ping')).toContain('********')
  })

  it('closes the session even when a remote probe throws', async () => {
    const fake = createFakeSshSession(() => {
      throw new Error('channel closed')
    })
    await expect(
      checkSiteConnection({
        config: createToolConfig(wpDir),
        openSession: async () => fake.session,
        includeLiveSite: false,
        checkLocalDatabase: async () => undefined
      })
    ).rejects.toThrow('channel closed')
    expect(fake.closed).toBe(1)
  })
})

describe('checkSiteConnection live-site checks', () => {
  it('adds the HTTP and certificate checks only for the health variant', async () => {
    const withoutLive = await probe({ includeLiveSite: false })
    expect(checkNames(withoutLive.report.checks)).not.toContain('http-reachable')

    const withLive = await probe({ includeLiveSite: true })
    expect(checkNames(withLive.report.checks)).toEqual([
      'ssh-connect',
      'wp-config-readable',
      'remote-db-credentials',
      'remote-db-ping',
      'disk-space',
      'local-db-login',
      'http-reachable',
      'tls-certificate'
    ])
    // The run's signal reaches the probes, so cancelling a health check stops the HTTP request too.
    expect(probeLiveSiteMock).toHaveBeenCalledWith('https://acme.com.au', withLive.signal)
    expect(probeTlsMock).toHaveBeenCalledWith('https://acme.com.au', withLive.signal)
  })

  it('classifies a dead live site as live-site while the server itself is fine', async () => {
    probeLiveSiteMock.mockResolvedValue({
      check: 'http-reachable',
      outcome: 'failed',
      detail: 'GET https://acme.com.au → 503'
    })
    const { report } = await probe({ includeLiveSite: true })
    expect(report).toMatchObject({ ok: false, failure: 'live-site', failedCount: 1 })
  })

  it('does not fail the report when there is no live domain to probe', async () => {
    probeLiveSiteMock.mockResolvedValue({
      check: 'http-reachable',
      outcome: 'skipped',
      detail: 'No live domain is configured for this environment.'
    })
    probeTlsMock.mockResolvedValue({
      check: 'tls-certificate',
      outcome: 'skipped',
      detail: 'No live domain configured.'
    })
    const { report } = await probe({ includeLiveSite: true, liveDomain: '' })
    expect(report).toMatchObject({ ok: true, failure: null })
  })
})
