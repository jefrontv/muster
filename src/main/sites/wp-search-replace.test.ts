import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  streamCommand,
  type StreamCommandOptions,
  type StreamCommandResult
} from '../lib/stream-command'
import { createEmptySiteEnvironment, type Site } from '../../shared/site-types'
import {
  SiteRunCancelledError,
  type SiteRunConfig,
  type SiteRunContext,
  SiteRunStepError
} from './pipeline-contract'
import { runWpSearchReplace } from './wp-search-replace'

vi.mock('../lib/stream-command', () => ({ streamCommand: vi.fn() }))

const streamCommandMock = vi.mocked(streamCommand)

function commandResult(overrides: Partial<StreamCommandResult> = {}): StreamCommandResult {
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

type TestContext = { context: SiteRunContext; statuses: string[]; logs: string[] }

function createTestContext(): TestContext {
  const controller = new AbortController()
  const statuses: string[] = []
  const logs: string[] = []
  return {
    statuses,
    logs,
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
  wpDir = mkdtempSync(path.join(tmpdir(), 'muster-search-replace-'))
  // WP-CLI needs core to bootstrap, and so does the step's own precondition check.
  writeFileSync(path.join(wpDir, 'wp-load.php'), '<?php')
  streamCommandMock.mockReset()
  streamCommandMock.mockResolvedValue(commandResult({ stdout: 'Success: Made 42 replacements.\n' }))
})

afterEach(() => {
  rmSync(wpDir, { recursive: true, force: true })
})

type ConfigOverrides = {
  localDomain?: string
  liveDomain?: string
  dbSocket?: string
  dbUser?: string
  dbPassword?: string
  dbPort?: number | null
  localDatabaseName?: string
  searchReplaceTimeoutSeconds?: number
}

function createConfig(overrides: ConfigOverrides = {}): SiteRunConfig {
  const environment = {
    ...createEmptySiteEnvironment(),
    liveDomain: overrides.liveDomain ?? 'acme.com.au'
  }
  const site: Site = {
    id: 'site-1',
    path: wpDir,
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: overrides.localDomain ?? 'acme.local',
    localStack: 'plain',
    dbUser: overrides.dbUser ?? 'root',
    dbSocket: overrides.dbSocket ?? '',
    dbPort: overrides.dbPort ?? null,
    phpVersion: '8.2',
    activeEnvironment: 'main',
    environments: { main: environment },
    notes: '',
    searchReplaceTimeoutSeconds: overrides.searchReplaceTimeoutSeconds ?? 0
  }
  return {
    site,
    environmentName: 'main',
    environment,
    group: 'import',
    wpDir,
    sshPassword: 'ssh-secret',
    dbPassword: overrides.dbPassword ?? 'db-secret',
    localDatabaseName: overrides.localDatabaseName
  }
}

const WP_CONFIG = `<?php
define('DB_NAME', 'local');
define( "DB_USER", 'produser' );
define('DB_PASSWORD', 'prodpass');
define('DB_HOST', 'db.internal:3306');
define('EFRONT_URL_OVERRIDE', 'https://acme.com.au');
$table_prefix = 'wp_';
`

function wpConfig(): string {
  return readFileSync(path.join(wpDir, 'wp-config.php'), 'utf8')
}

/** The wp invocation, ignoring the resolver plumbing around it. */
function wpCall(): { args: string[]; options: StreamCommandOptions | undefined } {
  const call = streamCommandMock.mock.calls.at(0)
  return { args: call?.[1] ?? [], options: call?.[2] }
}

const noLocalWpEnvironment = { resolveLocalWpEnvironment: async () => null }

describe('runWpSearchReplace', () => {
  it('skips without touching wp-config when either domain is unset', async () => {
    const { context, statuses } = createTestContext()
    writeFileSync(path.join(wpDir, 'wp-config.php'), WP_CONFIG)

    await runWpSearchReplace(context, createConfig({ localDomain: '' }), noLocalWpEnvironment)
    await runWpSearchReplace(context, createConfig({ liveDomain: '' }), noLocalWpEnvironment)

    expect(streamCommandMock).not.toHaveBeenCalled()
    expect(wpConfig()).toBe(WP_CONFIG)
    expect(statuses).toEqual([
      'Skipping WP Search and Replace: Local or Live domain not specified',
      'Skipping WP Search and Replace: Local or Live domain not specified'
    ])
  })

  it('rewrites the wp-config defines to point at the local database', async () => {
    const { context, logs } = createTestContext()
    writeFileSync(path.join(wpDir, 'wp-config.php'), WP_CONFIG)

    await runWpSearchReplace(context, createConfig(), noLocalWpEnvironment)

    const written = wpConfig()
    expect(written).toContain("define('DB_HOST', '127.0.0.1')")
    expect(written).toContain("define('DB_USER', 'root')")
    expect(written).toContain("define('DB_PASSWORD', 'db-secret')")
    expect(written).toContain("define('EFRONT_URL_OVERRIDE', 'http://acme.local')")
    // Unrelated defines survive.
    expect(written).toContain("define('DB_NAME', 'local')")
    expect(logs.some((line) => line.startsWith('Updated wp-config.php:'))).toBe(true)
  })

  it('uses localhost, not 127.0.0.1, when the site has a unix socket', async () => {
    const { context } = createTestContext()
    writeFileSync(path.join(wpDir, 'wp-config.php'), WP_CONFIG)

    await runWpSearchReplace(
      context,
      createConfig({ dbSocket: '/tmp/mysqld.sock' }),
      noLocalWpEnvironment
    )

    // mysqli only takes the socket path when the host is literally 'localhost'.
    expect(wpConfig()).toContain("define('DB_HOST', 'localhost')")
  })

  it('writes the port into DB_HOST for a TCP stack on a non-default port', async () => {
    const { context } = createTestContext()
    writeFileSync(path.join(wpDir, 'wp-config.php'), WP_CONFIG)

    // agent-local's shared MariaDB. Without the suffix WordPress dials 3306 and the site dies right
    // after the import, even though Muster's own connection (which passes the port separately) works.
    await runWpSearchReplace(context, createConfig({ dbPort: 10360 }), noLocalWpEnvironment)

    expect(wpConfig()).toContain("define('DB_HOST', '127.0.0.1:10360')")
  })

  it('leaves DB_HOST bare on the default port, so MAMP and DBngin are unchanged', async () => {
    const { context } = createTestContext()
    writeFileSync(path.join(wpDir, 'wp-config.php'), WP_CONFIG)

    await runWpSearchReplace(context, createConfig({ dbPort: 3306 }), noLocalWpEnvironment)

    expect(wpConfig()).toContain("define('DB_HOST', '127.0.0.1')")
  })

  it('rewrites DB_NAME when the stack owns the schema name', async () => {
    const { context } = createTestContext()
    writeFileSync(path.join(wpDir, 'wp-config.php'), WP_CONFIG)

    await runWpSearchReplace(
      context,
      createConfig({ dbPort: 10360, localDatabaseName: 'al_sulo' }),
      noLocalWpEnvironment
    )

    // The imported wp-config.php carries the source site's name, which al_sulo has no rights on.
    expect(wpConfig()).toContain("define('DB_NAME', 'al_sulo')")
  })

  it('leaves DB_NAME alone when no stack owns it', async () => {
    const { context } = createTestContext()
    writeFileSync(path.join(wpDir, 'wp-config.php'), WP_CONFIG)

    await runWpSearchReplace(context, createConfig(), noLocalWpEnvironment)

    expect(wpConfig()).toContain("define('DB_NAME', 'local')")
  })

  it('never logs the database password', async () => {
    const { context, logs } = createTestContext()
    writeFileSync(path.join(wpDir, 'wp-config.php'), WP_CONFIG)

    await runWpSearchReplace(
      context,
      createConfig({ dbPassword: 'hunter2-very-secret' }),
      noLocalWpEnvironment
    )

    expect(logs.join('\n')).not.toContain('hunter2-very-secret')
    expect(logs.join('\n')).toContain('DB_PASSWORD')
  })

  it('writes a password containing regex replacement patterns verbatim', async () => {
    const { context } = createTestContext()
    writeFileSync(path.join(wpDir, 'wp-config.php'), WP_CONFIG)

    await runWpSearchReplace(
      context,
      createConfig({ dbPassword: String.raw`p$&a$1b\c'd` }),
      noLocalWpEnvironment
    )

    // $& / $1 must not be expanded, the backslash and quote must be PHP-escaped.
    expect(wpConfig()).toContain(String.raw`define('DB_PASSWORD', 'p$&a$1b\\c\'d')`)
  })

  it('leaves wp-config alone when the import has not produced one', async () => {
    const { context } = createTestContext()

    await runWpSearchReplace(context, createConfig(), noLocalWpEnvironment)

    expect(streamCommandMock).toHaveBeenCalledTimes(1)
  })

  it('repoints package.json config.dev, and only when it already exists', async () => {
    const { context, logs } = createTestContext()
    const packageJsonPath = path.join(wpDir, 'package.json')
    writeFileSync(
      packageJsonPath,
      JSON.stringify({ name: 'theme', config: { dev: 'acme.com.au', other: 1 } })
    )

    await runWpSearchReplace(context, createConfig(), noLocalWpEnvironment)

    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      config: { dev: string; other: number }
    }
    expect(parsed.config).toEqual({ dev: 'acme.local', other: 1 })
    expect(logs).toContain('Updated package.json config.dev to acme.local')
  })

  it('ignores a package.json without a config.dev entry', async () => {
    const { context } = createTestContext()
    const packageJsonPath = path.join(wpDir, 'package.json')
    const original = JSON.stringify({ name: 'theme', scripts: { build: 'gulp' } })
    writeFileSync(packageJsonPath, original)

    await runWpSearchReplace(context, createConfig(), noLocalWpEnvironment)

    expect(readFileSync(packageJsonPath, 'utf8')).toBe(original)
  })

  it('rewrites live to local across every table, skipping guid and user_email', async () => {
    const { context } = createTestContext()

    await runWpSearchReplace(context, createConfig(), noLocalWpEnvironment)

    expect(wpCall().args).toEqual([
      'search-replace',
      'acme.com.au',
      'acme.local',
      '--all-tables',
      '--precise',
      '--report-changed-only',
      '--skip-columns=guid',
      '--skip-columns=user_email',
      `--path=${wpDir}`
    ])
    expect(wpCall().options?.cwd).toBe(wpDir)
    expect(wpCall().options?.env?.WP_CLI_PHP_ARGS).toBe(
      '-d error_reporting=E_ERROR -d display_errors=0'
    )
  })

  // The live failure: a theme repo imported without "Pull server files" has wp-content but no core,
  // so WP-CLI aborts with "This does not seem to be a WordPress installation" and took the whole
  // import down with it — after the database had already landed.
  it('degrades instead of failing when the checkout has no WordPress core', async () => {
    const { context, logs } = createTestContext()
    rmSync(path.join(wpDir, 'wp-load.php'))

    await expect(
      runWpSearchReplace(context, createConfig(), noLocalWpEnvironment)
    ).resolves.toBeUndefined()

    expect(streamCommandMock).not.toHaveBeenCalled()
    expect(logs.join('\n')).toContain('no WordPress core')
  })

  it('points --path at Bedrock core when wp/wp-load.php is present', async () => {
    const { context } = createTestContext()
    mkdirSync(path.join(wpDir, 'wp'))
    writeFileSync(path.join(wpDir, 'wp', 'wp-load.php'), '<?php')

    await runWpSearchReplace(context, createConfig(), noLocalWpEnvironment)

    expect(wpCall().args).toContain(`--path=${path.join(wpDir, 'wp')}`)
  })

  it('disables the deadline when the configured timeout is zero', async () => {
    const { context } = createTestContext()

    await runWpSearchReplace(
      context,
      createConfig({ searchReplaceTimeoutSeconds: 0 }),
      noLocalWpEnvironment
    )

    expect(wpCall().options?.timeoutMs).toBe(0)
  })

  it('converts the configured timeout from seconds to milliseconds', async () => {
    const { context } = createTestContext()

    await runWpSearchReplace(
      context,
      createConfig({ searchReplaceTimeoutSeconds: 900 }),
      noLocalWpEnvironment
    )

    expect(wpCall().options?.timeoutMs).toBe(900_000)
  })

  it('uses the LocalWP environment when the site has a socket', async () => {
    const { context, logs } = createTestContext()
    const resolveLocalWpEnvironment = vi.fn(async () => ({ PHPRC: '/local/conf/php', PATH: '/wp' }))

    await runWpSearchReplace(context, createConfig({ dbSocket: '/tmp/mysqld.sock' }), {
      resolveLocalWpEnvironment
    })

    expect(resolveLocalWpEnvironment).toHaveBeenCalledWith('/tmp/mysqld.sock')
    expect(wpCall().options?.env?.PHPRC).toBe('/local/conf/php')
    expect(logs).toContain('Using LocalWP PHP environment for WP-CLI…')
  })

  it('falls back to the system environment when Local cannot be located', async () => {
    const { context, logs } = createTestContext()

    await runWpSearchReplace(
      context,
      createConfig({ dbSocket: '/tmp/mysqld.sock' }),
      noLocalWpEnvironment
    )

    expect(logs).toContain('LocalWP env not found — falling back to system WP-CLI…')
    expect(wpCall().options?.env?.PATH).toBe(process.env.PATH)
  })

  it('surfaces only the Success summary line, not the per-table report', async () => {
    const { context, logs } = createTestContext()
    streamCommandMock.mockResolvedValue(
      commandResult({
        stdout: '+-----------+--------+\n| wp_posts  | 12     |\nSuccess: Made 12 replacements.\n'
      })
    )

    await runWpSearchReplace(context, createConfig(), noLocalWpEnvironment)

    expect(logs).toContain('WP Search and Replace: Success: Made 12 replacements.')
  })

  it('tolerates a nonzero exit whose stderr is only PHP warnings', async () => {
    const { context, logs } = createTestContext()
    streamCommandMock.mockResolvedValue(
      commandResult({
        code: 1,
        stderr:
          'PHP Warning:  Constant DISALLOW_FILE_EDIT already defined in wp-config.php on line 90\nDeprecated: strlen(): Passing null\n'
      })
    )

    await runWpSearchReplace(context, createConfig(), noLocalWpEnvironment)

    expect(logs).toContain('WP Search and Replace completed (ignored PHP warnings from wp-config).')
  })

  it('fails when stderr carries a real error alongside the warnings', async () => {
    const { context } = createTestContext()
    streamCommandMock.mockResolvedValue(
      commandResult({
        code: 1,
        stderr: 'PHP Warning: something benign\nError: Database connection failed\n'
      })
    )

    await expect(runWpSearchReplace(context, createConfig(), noLocalWpEnvironment)).rejects.toThrow(
      /WP Search and Replace failed: .*Database connection failed/
    )
  })

  it('fails with an actionable message when the run exceeds its timeout', async () => {
    const { context } = createTestContext()
    streamCommandMock.mockResolvedValue(commandResult({ code: -1, timedOut: true }))

    await expect(
      runWpSearchReplace(
        context,
        createConfig({ searchReplaceTimeoutSeconds: 60 }),
        noLocalWpEnvironment
      )
    ).rejects.toThrow(/exceeded its 60s timeout/)
  })

  it('degrades with a clear message when WP-CLI is not installed', async () => {
    const { context, logs } = createTestContext()
    streamCommandMock.mockRejectedValue(
      Object.assign(new Error('spawn wp ENOENT'), { code: 'ENOENT' })
    )
    writeFileSync(path.join(wpDir, 'wp-config.php'), WP_CONFIG)

    // The database is already imported; only the domain rewrite is missing, so this must not throw.
    await runWpSearchReplace(context, createConfig(), noLocalWpEnvironment)

    expect(logs.join('\n')).toMatch(/Skipping WP Search and Replace: WP-CLI/)
    // wp-config was still corrected, so the site loads against the local database.
    expect(wpConfig()).toContain("define('DB_HOST', '127.0.0.1')")
  })

  it('turns an abort into a cancellation', async () => {
    const { context } = createTestContext()
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    streamCommandMock.mockRejectedValue(abortError)

    await expect(runWpSearchReplace(context, createConfig(), noLocalWpEnvironment)).rejects.toThrow(
      SiteRunCancelledError
    )
  })

  it('reports a nonzero exit with no stderr as a step failure', async () => {
    const { context } = createTestContext()
    streamCommandMock.mockResolvedValue(commandResult({ code: 3 }))

    await expect(runWpSearchReplace(context, createConfig(), noLocalWpEnvironment)).rejects.toThrow(
      SiteRunStepError
    )
  })
})
