import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fakeFileOperations, type FakeFileTree } from './localwp-app-public.test-fixtures'
import { createLocalWpHost, type LocalWpCommandResult, type LocalWpHost } from './localwp-host'
import {
  previewLocalWpMigration,
  runLocalWpMigration,
  type LocalWpMigrationDependencies
} from './localwp-migration'
import type { LocalWpMigrationRequest } from './localwp-migration-plan'

const HOME = '/Users/tester'
const SUPPORT = path.join(HOME, 'Library', 'Application Support', 'Local')
const SITE_PATH = '/Sites/acme'
const APP_PUBLIC = path.join(SITE_PATH, 'app', 'public')
const SITE_ID = 'aBcD1234'
const SOCKET = path.join(SUPPORT, 'run', SITE_ID, 'mysql', 'mysqld.sock')

const WP_CONFIG = [
  '<?php',
  `define( 'DB_NAME', 'acme_local' );`,
  `define( 'DB_USER', 'acmeuser' );`,
  `define( 'DB_PASSWORD', 'sup3rsecret' );`,
  `define( 'DB_HOST', '127.0.0.1:8889' );`,
  ''
].join('\n')

function request(overrides: Partial<LocalWpMigrationRequest> = {}): LocalWpMigrationRequest {
  return {
    sitePath: SITE_PATH,
    siteName: 'Acme',
    domain: 'acme.local',
    adminEmail: 'hello@example.com',
    adminPassword: 'admin',
    ...overrides
  }
}

function plainProject(extra: Record<string, string | null> = {}): FakeFileTree {
  return fakeFileOperations({
    [path.join(SITE_PATH, 'wp-config.php')]: WP_CONFIG,
    [path.join(SITE_PATH, 'index.php')]: '<?php',
    [path.join(SITE_PATH, 'wp-content', 'themes', 'acme', 'style.css')]: 'body{}',
    ...extra
  })
}

function fakeHost(
  options: { platform?: string; appRunning?: boolean; registered?: boolean } = {}
): LocalWpHost {
  const sites = options.registered ? { [SITE_ID]: { path: SITE_PATH } } : {}
  return createLocalWpHost({
    platform: options.platform ?? 'darwin',
    homeDir: HOME,
    run: async (file): Promise<LocalWpCommandResult> =>
      file === 'pgrep' && options.appRunning !== false
        ? { code: 0, stdout: '4711', stderr: '' }
        : { code: 1, stdout: '', stderr: '' },
    readTextFile: async (filePath) =>
      filePath === path.join(SUPPORT, 'sites.json') ? JSON.stringify(sites) : null,
    pathExists: async () => false,
    listDirectory: async () => [],
    canonicalPath: async (filePath) => filePath,
    isTcpPortOpen: async () => false,
    isMysqlSocketReady: async () => false,
    sleep: async () => {},
    environment: {}
  })
}

type RunHarness = {
  dependencies: LocalWpMigrationDependencies
  imports: { dumpPath: string; databaseName: string; socketPath: string }[]
  exported: { databaseName: string; databaseUser: string; databasePassword: string }[]
  /** Temp directories the export created, so the test can assert the cleanup path is safe. */
  discarded: string[]
}

function harness(
  tree: FakeFileTree,
  overrides: Partial<LocalWpMigrationDependencies> = {},
  hostOptions: Parameters<typeof fakeHost>[0] = {}
): RunHarness {
  const imports: RunHarness['imports'] = []
  const exported: RunHarness['exported'] = []
  const discarded: string[] = []
  const dependencies: LocalWpMigrationDependencies = {
    host: fakeHost({ appRunning: true, ...hostOptions }),
    fileOperations: tree.operations,
    importDatabase: async (options) => {
      imports.push(options)
    },
    exportDatabase: async (input) => {
      exported.push({
        databaseName: input.databaseName,
        databaseUser: input.databaseUser,
        databasePassword: input.databasePassword
      })
      const workDirectory = `${tmpdir()}/muster-localwp-export-test`
      await mkdir(workDirectory, { recursive: true })
      discarded.push(workDirectory)
      return {
        ok: true,
        dumpPath: path.join(workDirectory, 'local-db-export.sql.gz'),
        workDirectory
      }
    },
    // Local scaffolds app/public while creating the site; model that so the clear step is exercised.
    createSite: async () => {
      await tree.operations.writeTextFile(path.join(APP_PUBLIC, 'index.php'), '// scaffold')
      await tree.operations.writeTextFile(
        path.join(APP_PUBLIC, 'wp-content', 'themes', 'twentytwentyfour', 'style.css'),
        '/* scaffold */'
      )
      return { ok: true, siteId: SITE_ID, message: 'LocalWP site created' }
    },
    awaitSocket: async () => SOCKET,
    ...overrides
  }
  return { dependencies, imports, exported, discarded }
}

describe('previewLocalWpMigration', () => {
  it('reports the platform as unsupported off darwin', async () => {
    const tree = plainProject()
    const plan = await previewLocalWpMigration(request(), {
      host: fakeHost({ platform: 'linux' }),
      fileOperations: tree.operations
    })
    expect(plan.ok).toBe(false)
    expect(plan.blockedReason).toContain('macOS')
    expect(plan.moves).toEqual([])
  })

  it('lists every move and edit without mutating anything', async () => {
    const tree = plainProject()
    const before = new Map(tree.entries)
    const plan = await previewLocalWpMigration(request(), {
      host: fakeHost({ appRunning: true }),
      fileOperations: tree.operations
    })
    expect(plan.ok).toBe(true)
    expect(plan.databaseName).toBe('acme_local')
    expect(plan.databaseUser).toBe('acmeuser')
    expect(plan.moves.map((move) => path.basename(move.from))).toEqual([
      'index.php',
      'wp-config.php',
      'wp-content'
    ])
    expect(plan.moves.every((move) => move.to.startsWith(APP_PUBLIC))).toBe(true)
    expect(plan.edits).toEqual([path.join(APP_PUBLIC, 'wp-config.php')])
    expect(plan.steps.length).toBeGreaterThan(0)
    expect([...tree.entries]).toEqual([...before])
  })

  it('never puts the database password in the plan', async () => {
    const tree = plainProject()
    const plan = await previewLocalWpMigration(request(), {
      host: fakeHost({ appRunning: true }),
      fileOperations: tree.operations
    })
    expect(JSON.stringify(plan)).not.toContain('sup3rsecret')
  })

  it('blocks when the project is already a LocalWP site', async () => {
    const tree = plainProject({ [path.join(APP_PUBLIC, 'wp-config.php')]: WP_CONFIG })
    const plan = await previewLocalWpMigration(request(), {
      host: fakeHost({ appRunning: true }),
      fileOperations: tree.operations
    })
    expect(plan.blockedReason).toBe('This project is already a LocalWP site.')
  })

  it('blocks when the project is already registered with Local', async () => {
    const tree = plainProject()
    const plan = await previewLocalWpMigration(request(), {
      host: fakeHost({ appRunning: true, registered: true }),
      fileOperations: tree.operations
    })
    expect(plan.blockedReason).toBe('This project is already registered with LocalWP.')
  })

  it('blocks when the Local app is not running', async () => {
    const tree = plainProject()
    const plan = await previewLocalWpMigration(request(), {
      host: fakeHost({ appRunning: false }),
      fileOperations: tree.operations
    })
    expect(plan.blockedReason).toContain('Local app is not running')
  })

  it('blocks when there is no WordPress install at the project root', async () => {
    const tree = fakeFileOperations({ [path.join(SITE_PATH, 'readme.md')]: '# acme' })
    const plan = await previewLocalWpMigration(request(), {
      host: fakeHost({ appRunning: true }),
      fileOperations: tree.operations
    })
    expect(plan.blockedReason).toContain('wp-config.php not found')
  })

  it('blocks an empty domain', async () => {
    const tree = plainProject()
    const plan = await previewLocalWpMigration(request({ domain: '  ' }), {
      host: fakeHost({ appRunning: true }),
      fileOperations: tree.operations
    })
    expect(plan.blockedReason).toContain('domain is required')
  })
})

describe('non-empty app/public guard', () => {
  const occupied = { [path.join(APP_PUBLIC, 'leftover.php')]: '<?php' }

  it('refuses without force and names the entries at risk', async () => {
    const tree = plainProject(occupied)
    const plan = await previewLocalWpMigration(request(), {
      host: fakeHost({ appRunning: true }),
      fileOperations: tree.operations
    })
    expect(plan.ok).toBe(false)
    expect(plan.blockedReason).toContain('is not empty (1 entries)')
    expect(plan.appPublicEntries).toEqual(['leftover.php'])
  })

  it('mutates nothing when the run is refused', async () => {
    const tree = plainProject(occupied)
    const before = new Map(tree.entries)
    const { dependencies, imports } = harness(tree)
    const result = await runLocalWpMigration(request(), dependencies)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('is not empty')
    expect([...tree.entries]).toEqual([...before])
    expect(imports).toEqual([])
  })

  it('proceeds with force and clears the existing contents', async () => {
    const tree = plainProject(occupied)
    const { dependencies } = harness(tree)
    const result = await runLocalWpMigration(request({ force: true }), dependencies)
    expect(result.ok).toBe(true)
    expect(tree.entries.has(path.join(APP_PUBLIC, 'leftover.php'))).toBe(false)
  })
})

describe('runLocalWpMigration', () => {
  it('relocates the project, rewrites DB_HOST, and imports the dump over the new socket', async () => {
    const tree = plainProject()
    const { dependencies, imports, exported } = harness(tree)
    const result = await runLocalWpMigration(request(), dependencies)
    expect(result.ok).toBe(true)
    expect(result.socketPath).toBe(SOCKET)
    expect(result.localWpRoot).toBe('app/public')
    expect(result.databaseImported).toBe(true)
    // The pre-migration credentials are what the export must use.
    expect(exported).toEqual([
      { databaseName: 'acme_local', databaseUser: 'acmeuser', databasePassword: 'sup3rsecret' }
    ])
    expect(imports).toHaveLength(1)
    expect(imports[0]?.databaseName).toBe('acme_local')
    expect(imports[0]?.socketPath).toBe(SOCKET)
    expect(imports[0]?.dumpPath).toContain('muster-localwp-export-')
    expect(
      tree.entries.has(path.join(APP_PUBLIC, 'wp-content', 'themes', 'acme', 'style.css'))
    ).toBe(true)
    expect(tree.entries.has(path.join(SITE_PATH, 'wp-config.php'))).toBe(false)
    expect(tree.entries.get(path.join(APP_PUBLIC, 'wp-config.php'))).toContain(
      `define('DB_HOST', 'localhost')`
    )
  })

  it('aborts before touching disk when Local refuses to create the site', async () => {
    const tree = plainProject()
    const before = new Map(tree.entries)
    const { dependencies } = harness(tree, {
      createSite: async () => ({ ok: false, siteId: '', message: 'domain already taken' })
    })
    const result = await runLocalWpMigration(request(), dependencies)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('domain already taken')
    expect([...tree.entries]).toEqual([...before])
  })

  it('leaves the project files alone when the socket never appears', async () => {
    const tree = plainProject()
    const { dependencies, imports } = harness(tree, { awaitSocket: async () => null })
    const result = await runLocalWpMigration(request(), dependencies)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Timed out waiting for the LocalWP MySQL socket')
    // Local's own scaffold may exist by now, but nothing of the project has been relocated.
    expect(tree.entries.has(path.join(SITE_PATH, 'wp-config.php'))).toBe(true)
    expect(
      tree.entries.has(path.join(SITE_PATH, 'wp-content', 'themes', 'acme', 'style.css'))
    ).toBe(true)
    expect(
      tree.entries.has(path.join(APP_PUBLIC, 'wp-content', 'themes', 'acme', 'style.css'))
    ).toBe(false)
    expect(imports).toEqual([])
  })

  it('still migrates the files when the database cannot be exported', async () => {
    const tree = plainProject()
    const { dependencies, imports } = harness(tree, {
      exportDatabase: async () => ({
        ok: false,
        databaseMissing: true,
        reason: "Local database 'acme_local' does not exist."
      })
    })
    const result = await runLocalWpMigration(request(), dependencies)
    expect(result.ok).toBe(true)
    expect(result.databaseImported).toBe(false)
    expect(imports).toEqual([])
    expect(result.log.some((line) => line.includes('does not exist'))).toBe(true)
    expect(tree.entries.has(path.join(APP_PUBLIC, 'index.php'))).toBe(true)
  })

  it('completes with a manual-import notice when the import itself fails', async () => {
    const tree = plainProject()
    const { dependencies } = harness(tree, {
      importDatabase: async () => {
        throw new Error('access denied')
      }
    })
    const result = await runLocalWpMigration(request(), dependencies)
    expect(result.ok).toBe(true)
    expect(result.databaseImported).toBe(false)
    expect(result.message).toContain('set the database up manually')
    // The files are still in place, so the user can re-run the import.
    expect(tree.entries.has(path.join(APP_PUBLIC, 'wp-config.php'))).toBe(true)
  })

  it('de-duplicates repeated defines in the relocated wp-config', async () => {
    const duplicated = `${WP_CONFIG}define( 'DISALLOW_FILE_EDIT', true );\ndefine( 'DISALLOW_FILE_EDIT', false );\n`
    const tree = plainProject({ [path.join(SITE_PATH, 'wp-config.php')]: duplicated })
    const { dependencies } = harness(tree)
    const result = await runLocalWpMigration(request(), dependencies)
    expect(result.ok).toBe(true)
    expect(result.log.some((line) => line.includes('de-duplicated DISALLOW_FILE_EDIT'))).toBe(true)
  })

  it('surfaces its progress through onStatus in order', async () => {
    const tree = plainProject()
    const statuses: string[] = []
    const { dependencies } = harness(tree, { onStatus: (message) => statuses.push(message) })
    const result = await runLocalWpMigration(request(), dependencies)
    expect(statuses).toEqual(result.log)
    expect(statuses.at(-1)).toBe('Database imported.')
  })
})
