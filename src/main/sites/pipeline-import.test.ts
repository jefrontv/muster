import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createEmptySiteEnvironment,
  type Site,
  type SiteEnvironment
} from '../../shared/site-types'
import {
  type RemoteLayout,
  SiteRunCancelledError,
  type SiteRunConfig,
  type SiteRunContext,
  SiteRunStepError,
  type SiteSshSession
} from './pipeline-contract'
import { runImportPipeline, type SiteImportDependencies } from './pipeline-import'

type TestContext = {
  context: SiteRunContext
  statuses: string[]
  logs: string[]
  cancel: () => void
}

function createTestContext(): TestContext {
  const controller = new AbortController()
  const statuses: string[] = []
  const logs: string[] = []
  return {
    statuses,
    logs,
    cancel: () => controller.abort(),
    context: {
      signal: controller.signal,
      log: (line) => logs.push(line),
      status: (stage) => statuses.push(stage),
      progress: () => {},
      throwIfCancelled: () => {
        if (controller.signal.aborted) {
          throw new SiteRunCancelledError()
        }
      }
    }
  }
}

let wpDir: string

beforeEach(() => {
  wpDir = mkdtempSync(path.join(tmpdir(), 'muster-import-'))
})

afterEach(() => {
  rmSync(wpDir, { recursive: true, force: true })
})

function createConfig(environmentOverrides: Partial<SiteEnvironment> = {}): SiteRunConfig {
  const environment: SiteEnvironment = {
    ...createEmptySiteEnvironment(),
    hostname: 'srv.example.com',
    username: 'deploy',
    rootPath: 'public_html',
    liveDomain: 'acme.com.au',
    ...environmentOverrides
  }
  const site: Site = {
    id: 'site-1',
    path: path.join(wpDir, 'checkout'),
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'localwp',
    dbUser: 'root',
    dbSocket: '/stale/mysqld.sock',
    dbPort: null,
    phpVersion: '8.2',
    activeEnvironment: 'main',
    environments: { main: environment },
    notes: '',
    searchReplaceTimeoutSeconds: 0
  }
  return {
    site,
    environmentName: 'main',
    environment,
    group: 'import',
    wpDir,
    sshPassword: 'ssh-secret',
    dbPassword: 'db-secret'
  }
}

const LAYOUT: RemoteLayout = { webroot: 'public_html', contentDir: 'wp-content' }

type FakeSession = SiteSshSession & { removed: string[]; closed: number }

function createFakeSession(): FakeSession {
  const removed: string[] = []
  const session: FakeSession = {
    removed,
    closed: 0,
    exec: async () => ({ code: 0, stdout: '', stderr: '' }),
    download: async () => {},
    upload: async () => {},
    writeSecureRemoteFile: async () => {},
    removeRemoteFile: async (remotePath) => {
      removed.push(remotePath)
    },
    close: async () => {
      session.closed += 1
    }
  }
  return session
}

type Harness = {
  deps: SiteImportDependencies
  order: string[]
  session: FakeSession
  calls: {
    ensureLocalSiteRunning: ReturnType<typeof vi.fn>
    checkLocalMysqlConnection: ReturnType<typeof vi.fn>
    createSiteSshSession: ReturnType<typeof vi.fn>
    importLocalDatabase: ReturnType<typeof vi.fn>
    snapshotLocalDatabase: ReturnType<typeof vi.fn>
    extractZipArchive: ReturnType<typeof vi.fn>
    applyWpUploadRewrite: ReturnType<typeof vi.fn>
    cleanUpLocalHtaccess: ReturnType<typeof vi.fn>
    runWpSearchReplace: ReturnType<typeof vi.fn>
  }
}

function createHarness(overrides: Partial<SiteImportDependencies> = {}): Harness {
  const order: string[] = []
  const session = createFakeSession()
  const record = <T>(name: string, value: T) =>
    vi.fn(async () => {
      order.push(name)
      return value
    })

  const calls = {
    ensureLocalSiteRunning: record('ensureLocalSiteRunning', {
      ok: true,
      socketPath: '/fresh/mysqld.sock',
      message: ''
    }),
    checkLocalMysqlConnection: record('checkLocalMysqlConnection', undefined),
    createSiteSshSession: record('createSiteSshSession', session),
    importLocalDatabase: record('importLocalDatabase', undefined),
    snapshotLocalDatabase: record('snapshotLocalDatabase', { ok: true }),
    extractZipArchive: vi.fn(async () => {
      order.push('extractZipArchive')
    }),
    applyWpUploadRewrite: record('applyWpUploadRewrite', undefined),
    cleanUpLocalHtaccess: record('cleanUpLocalHtaccess', undefined),
    runWpSearchReplace: record('runWpSearchReplace', undefined)
  }

  const deps: SiteImportDependencies = {
    ...calls,
    resolveRemoteLayout: record('resolveRemoteLayout', LAYOUT),
    readRemoteDbCredentials: record('readRemoteDbCredentials', {
      name: 'prod_db',
      user: 'prod_user',
      password: 'prod-pass'
    }),
    dumpAndDownloadRemoteDatabase: record('dumpAndDownloadRemoteDatabase', {
      localDumpPath: path.join(wpDir, 'db_backup.sql.gz'),
      remoteDbName: 'prod_db'
    }),
    readLocalWpConfigDbName: record('readLocalWpConfigDbName', 'local'),
    // Writes the archives the pipeline is expected to extract and then delete.
    pullRemoteFileArchives: vi.fn(async () => {
      order.push('pullRemoteFileArchives')
      writeFileSync(path.join(wpDir, 'base.zip'), 'base')
      writeFileSync(path.join(wpDir, 'wp-content.zip'), 'content')
      return {
        baseArchivePath: path.join(wpDir, 'base.zip'),
        contentArchivePath: path.join(wpDir, 'wp-content.zip'),
        contentDirectoryName: 'wp-content'
      }
    }),
    ...overrides
  }
  return { deps, order, session, calls }
}

describe('runImportPipeline', () => {
  it('never opens SSH for a local-only toggle set', async () => {
    const { context, statuses } = createTestContext()
    const { deps, order, calls } = createHarness()
    // No hostname at all: a local-only run must not require a remote target to be configured.
    const config = createConfig({
      hostname: '',
      username: '',
      wpSearchReplace: true,
      wpUploadRewrite: true
    })

    await runImportPipeline(context, config, deps)

    expect(calls.createSiteSshSession).not.toHaveBeenCalled()
    expect(calls.checkLocalMysqlConnection).not.toHaveBeenCalled()
    expect(order).toEqual([
      'ensureLocalSiteRunning',
      'applyWpUploadRewrite',
      'cleanUpLocalHtaccess',
      'runWpSearchReplace'
    ])
    expect(statuses).toContain('Operations completed successfully!')
  })

  it('runs the upload rewrite before search-replace, so the domain is already corrected', async () => {
    const { context } = createTestContext()
    const { deps, order } = createHarness()

    await runImportPipeline(
      context,
      createConfig({ wpSearchReplace: true, wpUploadRewrite: true }),
      deps
    )

    expect(order.indexOf('applyWpUploadRewrite')).toBeLessThan(order.indexOf('runWpSearchReplace'))
    expect(order.indexOf('cleanUpLocalHtaccess')).toBeLessThan(order.indexOf('runWpSearchReplace'))
  })

  it('checks local MySQL before connecting to the server', async () => {
    const { context } = createTestContext()
    const { deps, order } = createHarness()

    await runImportPipeline(context, createConfig({ exportDatabase: true }), deps)

    // Failing here costs a second; failing after a multi-GB download costs an hour.
    expect(order.indexOf('checkLocalMysqlConnection')).toBeLessThan(
      order.indexOf('createSiteSshSession')
    )
    expect(order).toEqual([
      'ensureLocalSiteRunning',
      'checkLocalMysqlConnection',
      'createSiteSshSession',
      'resolveRemoteLayout',
      'readRemoteDbCredentials',
      'dumpAndDownloadRemoteDatabase',
      'readLocalWpConfigDbName',
      // The safety net dumps the database importLocalDatabase is about to overwrite.
      'snapshotLocalDatabase',
      'importLocalDatabase'
    ])
  })

  it('imports into the local wp-config database name, not the remote one', async () => {
    const { context, logs } = createTestContext()
    const { deps, calls } = createHarness()

    await runImportPipeline(context, createConfig({ exportDatabase: true }), deps)

    expect(calls.importLocalDatabase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      path.join(wpDir, 'db_backup.sql.gz'),
      'local'
    )
    expect(logs).toContain(
      "Remote DB is 'prod_db', importing into local DB 'local' from wp-config.php."
    )
  })

  it('falls back to the remote database name when there is no local wp-config', async () => {
    const { context } = createTestContext()
    const { deps, calls } = createHarness({ readLocalWpConfigDbName: vi.fn(async () => '') })

    await runImportPipeline(context, createConfig({ exportDatabase: true }), deps)

    expect(calls.importLocalDatabase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.any(String),
      'prod_db'
    )
  })

  it('extracts both archives and deletes each one as soon as it is unpacked', async () => {
    const { context } = createTestContext()
    const { deps, order, calls } = createHarness()

    await runImportPipeline(context, createConfig({ exportFiles: true }), deps)

    expect(order).toEqual([
      'createSiteSshSession',
      'resolveRemoteLayout',
      'pullRemoteFileArchives',
      'extractZipArchive',
      'extractZipArchive'
    ])
    expect(calls.extractZipArchive).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      'extract-base-archive',
      path.join(wpDir, 'base.zip'),
      wpDir
    )
    expect(calls.extractZipArchive).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      'extract-content-archive',
      path.join(wpDir, 'wp-content.zip'),
      path.join(wpDir, 'wp-content')
    )
    // The two archives together can be several GB.
    expect(existsSync(path.join(wpDir, 'base.zip'))).toBe(false)
    expect(existsSync(path.join(wpDir, 'wp-content.zip'))).toBe(false)
  })

  it('does not start the local stack for a files-only run', async () => {
    const { context } = createTestContext()
    const { deps, calls } = createHarness()

    await runImportPipeline(context, createConfig({ exportFiles: true }), deps)

    expect(calls.ensureLocalSiteRunning).not.toHaveBeenCalled()
  })

  it('runs no stage at all when every toggle is off', async () => {
    const { context, statuses } = createTestContext()
    const { deps, order, calls } = createHarness()

    await runImportPipeline(context, createConfig(), deps)

    expect(order).toEqual([])
    expect(calls.createSiteSshSession).not.toHaveBeenCalled()
    expect(calls.applyWpUploadRewrite).not.toHaveBeenCalled()
    expect(calls.runWpSearchReplace).not.toHaveBeenCalled()
    expect(statuses).toEqual(['Operations completed successfully!'])
  })

  it('skips only the toggles that are off', async () => {
    const { context } = createTestContext()
    const { deps, order } = createHarness()

    await runImportPipeline(
      context,
      createConfig({ exportDatabase: true, wpUploadRewrite: true }),
      deps
    )

    expect(order).toContain('importLocalDatabase')
    expect(order).toContain('applyWpUploadRewrite')
    expect(order).not.toContain('pullRemoteFileArchives')
    expect(order).not.toContain('runWpSearchReplace')
  })

  it('aborts between stages without running the later ones', async () => {
    const { context, cancel } = createTestContext()
    const { deps, order } = createHarness({
      importLocalDatabase: vi.fn(async () => {
        order.push('importLocalDatabase')
        cancel()
      })
    })

    await expect(
      runImportPipeline(
        context,
        createConfig({
          exportDatabase: true,
          exportFiles: true,
          wpUploadRewrite: true,
          wpSearchReplace: true
        }),
        deps
      )
    ).rejects.toThrow(SiteRunCancelledError)

    expect(order).toContain('importLocalDatabase')
    expect(order).not.toContain('pullRemoteFileArchives')
    expect(order).not.toContain('applyWpUploadRewrite')
    expect(order).not.toContain('runWpSearchReplace')
  })

  it('refuses a remote step with no hostname, before opening a connection', async () => {
    const { context } = createTestContext()
    const { deps, calls } = createHarness()

    await expect(
      runImportPipeline(context, createConfig({ hostname: '  ', exportFiles: true }), deps)
    ).rejects.toThrow(/No remote SSH host configured for 'Acme'/)
    expect(calls.createSiteSshSession).not.toHaveBeenCalled()
  })

  it('refuses a remote step with no SSH username', async () => {
    const { context } = createTestContext()
    const { deps } = createHarness()

    await expect(
      runImportPipeline(context, createConfig({ username: '', exportFiles: true }), deps)
    ).rejects.toThrow(/No SSH username configured for 'Acme'/)
  })

  it('adopts the socket LocalWP reports and passes it to every later stage', async () => {
    const { context, logs } = createTestContext()
    const { deps, calls } = createHarness()

    await runImportPipeline(
      context,
      createConfig({ exportDatabase: true, wpSearchReplace: true }),
      deps
    )

    // A stored socket goes stale whenever Local restarts and re-keys its run directory.
    expect(logs).toContain('Using local MySQL socket /fresh/mysqld.sock')
    const [checkedConfig] = calls.checkLocalMysqlConnection.mock.calls[0] as [SiteRunConfig]
    expect(checkedConfig.site.dbSocket).toBe('/fresh/mysqld.sock')
    const searchReplaceConfig = calls.runWpSearchReplace.mock.calls[0]?.[1] as SiteRunConfig
    expect(searchReplaceConfig.site.dbSocket).toBe('/fresh/mysqld.sock')
  })

  it('keeps the stored socket when LocalWP reports none', async () => {
    const { context } = createTestContext()
    const { deps, calls } = createHarness({
      ensureLocalSiteRunning: vi.fn(async () => ({ ok: true, socketPath: '', message: '' }))
    })

    await runImportPipeline(context, createConfig({ wpSearchReplace: true }), deps)

    const config = calls.runWpSearchReplace.mock.calls[0]?.[1] as SiteRunConfig
    expect(config.site.dbSocket).toBe('/stale/mysqld.sock')
  })

  it('fails the run when a LocalWP site cannot be started', async () => {
    const { context } = createTestContext()
    const { deps, calls } = createHarness({
      ensureLocalSiteRunning: vi.fn(async () => ({
        ok: false,
        socketPath: '',
        message: 'Local is not running.'
      }))
    })

    await expect(
      runImportPipeline(context, createConfig({ exportDatabase: true }), deps)
    ).rejects.toThrow(new SiteRunStepError('ensure-local-stack-running', 'Local is not running.'))
    expect(calls.checkLocalMysqlConnection).not.toHaveBeenCalled()
  })

  it('deletes local and remote temp artifacts and closes the session on success', async () => {
    const { context } = createTestContext()
    const { deps, session } = createHarness()
    for (const name of ['db_backup.sql.gz', 'base.zip', 'wp-content.zip', 'app.zip']) {
      writeFileSync(path.join(wpDir, name), 'leftover')
    }

    await runImportPipeline(context, createConfig({ exportFiles: true }), deps)

    for (const name of ['db_backup.sql.gz', 'base.zip', 'wp-content.zip', 'app.zip']) {
      expect(existsSync(path.join(wpDir, name))).toBe(false)
    }
    expect(session.removed).toEqual([
      'public_html/db_backup.sql.gz',
      'public_html/base.zip',
      'public_html/wp-content/wp-content.zip'
    ])
    expect(session.closed).toBe(1)
  })

  it('still cleans up and closes the session when a stage fails', async () => {
    const { context } = createTestContext()
    const { deps, session } = createHarness({
      pullRemoteFileArchives: vi.fn(async () => {
        throw new Error('zip failed on the server')
      })
    })
    writeFileSync(path.join(wpDir, 'base.zip'), 'orphan')

    await expect(
      runImportPipeline(context, createConfig({ exportFiles: true }), deps)
    ).rejects.toThrow('zip failed on the server')

    // Otherwise a failed run orphans hundreds of MB locally and remotely.
    expect(existsSync(path.join(wpDir, 'base.zip'))).toBe(false)
    expect(session.removed).toContain('public_html/base.zip')
    expect(session.closed).toBe(1)
  })

  it('cleans up against the configured root when the layout was never resolved', async () => {
    const { context } = createTestContext()
    const { deps, session } = createHarness({
      resolveRemoteLayout: vi.fn(async () => {
        throw new SiteRunStepError('remote-layout', 'wp-config.php not found in public_html.')
      })
    })

    await expect(
      runImportPipeline(context, createConfig({ exportFiles: true }), deps)
    ).rejects.toThrow(/Not a WordPress installation|wp-config\.php not found/)

    expect(session.removed).toEqual([
      'public_html/db_backup.sql.gz',
      'public_html/base.zip',
      'public_html/wp-content/wp-content.zip'
    ])
  })

  it('does not let a failing session close mask the error that ended the run', async () => {
    const { context } = createTestContext()
    const { deps, session } = createHarness({
      runWpSearchReplace: vi.fn(async () => {
        throw new SiteRunStepError('wp-search-replace', 'WP Search and Replace failed: boom')
      })
    })
    session.close = async () => {
      throw new Error('socket already gone')
    }

    await expect(
      runImportPipeline(context, createConfig({ exportFiles: true, wpSearchReplace: true }), deps)
    ).rejects.toThrow('WP Search and Replace failed: boom')
  })

  it('uses the Bedrock content directory when cleaning up remote artifacts', async () => {
    const { context } = createTestContext()
    const { deps, session } = createHarness({
      resolveRemoteLayout: vi.fn(async () => ({ webroot: 'public_html/web', contentDir: 'app' })),
      pullRemoteFileArchives: vi.fn(async () => ({
        baseArchivePath: path.join(wpDir, 'base.zip'),
        contentArchivePath: path.join(wpDir, 'app.zip'),
        contentDirectoryName: 'app'
      }))
    })

    await runImportPipeline(context, createConfig({ exportFiles: true }), deps)

    expect(session.removed).toEqual([
      'public_html/db_backup.sql.gz',
      'public_html/web/base.zip',
      'public_html/web/app/app.zip'
    ])
  })
})
