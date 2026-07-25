import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySiteEnvironment, type Site } from '../../shared/site-types'
import { streamCommand, type StreamCommandResult } from '../lib/stream-command'
import {
  buildLocalImportPipeline,
  importLocalDatabase,
  renderLocalMysqlOptionFile
} from './local-database-import'
import type * as MysqlBinaryModule from './mysql-binary'
import {
  SiteRunCancelledError,
  SiteRunStepError,
  type SiteRunConfig,
  type SiteRunContext
} from './pipeline-contract'

const FAKE_MYSQL = '/opt/fake/bin/mysql'

vi.mock('../lib/stream-command', () => ({ streamCommand: vi.fn() }))
vi.mock('./mysql-binary', async (importOriginal) => ({
  ...(await importOriginal<typeof MysqlBinaryModule>()),
  resolveMysqlBinary: () => FAKE_MYSQL
}))

const streamCommandMock = vi.mocked(streamCommand)

function ok(overrides: Partial<StreamCommandResult> = {}): StreamCommandResult {
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

function createConfig(site: Partial<Site> = {}, dbPassword = 'local-pass'): SiteRunConfig {
  const resolved: Site = {
    id: 'site-1',
    path: '/sites/acme',
    repoId: null,
    displayName: 'Acme',
    localWpRoot: 'app/public',
    localDomain: 'acme.local',
    localStack: 'localwp',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '8.2',
    activeEnvironment: 'main',
    environments: { main: createEmptySiteEnvironment() },
    notes: '',
    searchReplaceTimeoutSeconds: 0,
    ...site
  }
  return {
    site: resolved,
    environmentName: 'main',
    environment: resolved.environments.main,
    group: 'import',
    wpDir: '/sites/acme/app/public',
    sshPassword: '',
    dbPassword
  }
}

function createContext(cancelAfter = Number.POSITIVE_INFINITY): {
  context: SiteRunContext
  logs: string[]
  statuses: string[]
} {
  let checks = 0
  const logs: string[] = []
  const statuses: string[] = []
  return {
    logs,
    statuses,
    context: {
      signal: new AbortController().signal,
      log: (line) => logs.push(line),
      status: (stage) => statuses.push(stage),
      progress: () => undefined,
      throwIfCancelled: () => {
        checks += 1
        if (checks > cancelAfter) {
          throw new SiteRunCancelledError()
        }
      }
    }
  }
}

/** argv of the nth streamCommand call, as [command, args, options]. */
function callAt(index: number): [string, string[], Record<string, unknown>] {
  const call = streamCommandMock.mock.calls[index]
  return [call[0], call[1], (call[2] ?? {}) as Record<string, unknown>]
}

beforeEach(() => {
  streamCommandMock.mockReset()
  streamCommandMock.mockResolvedValue(ok())
})

describe('renderLocalMysqlOptionFile', () => {
  it('pins the LocalWP socket when the site has one', () => {
    expect(renderLocalMysqlOptionFile(createConfig({ dbSocket: '/tmp/mysqld.sock' }))).toBe(
      '[client]\nuser="root"\npassword="local-pass"\nsocket="/tmp/mysqld.sock"\n'
    )
  })

  it('pins loopback TCP with the MAMP port when there is no socket', () => {
    expect(renderLocalMysqlOptionFile(createConfig({ dbPort: 8889 }))).toBe(
      '[client]\nuser="root"\npassword="local-pass"\nhost="127.0.0.1"\nprotocol=tcp\nport=8889\n'
    )
  })

  it('treats a whitespace-only socket as no socket', () => {
    expect(renderLocalMysqlOptionFile(createConfig({ dbSocket: '   ' }))).toContain('protocol=tcp')
  })
})

describe('buildLocalImportPipeline', () => {
  const paths = { mysqlBinary: FAKE_MYSQL, optionFilePath: '/tmp/my.cnf', dbName: 'acme_local' }

  it('sets pipefail so a corrupt archive cannot import as a partial database', () => {
    expect(buildLocalImportPipeline(paths, '/tmp/db.sql.gz')).toContain('set -o pipefail')
  })

  it('streams the dump instead of extracting it to disk first', () => {
    expect(buildLocalImportPipeline(paths, '/tmp/db.sql.gz')).toContain(
      "gunzip -c '/tmp/db.sql.gz' |"
    )
  })

  it('quotes every interpolated path and name', () => {
    const command = buildLocalImportPipeline(
      { ...paths, dbName: "acme'; touch /tmp/pwned" },
      "/tmp/it's.gz"
    )
    expect(command).toContain(String.raw`'/tmp/it'\''s.gz'`)
    expect(command).toContain(String.raw`--database='acme'\''; touch /tmp/pwned'`)
  })

  it('passes credentials by option file, never on the command line', () => {
    const command = buildLocalImportPipeline(paths, '/tmp/db.sql.gz')
    expect(command).toContain("--defaults-extra-file='/tmp/my.cnf'")
    expect(command).not.toContain('--password')
  })
})

// The pipefail claim is only worth something if a real shell agrees, so run the generated
// pipeline against a stub mysql on PATH. The truncated-archive case below is the exact bug
// pipefail exists to catch: gunzip dies, mysql exits 0, and the import looks like a success.
describe.skipIf(process.platform === 'win32')('buildLocalImportPipeline under a real shell', () => {
  let shellDir = ''
  let binDir = ''
  let dumpPath = ''
  let sinkPath = ''
  let argvPath = ''

  function runPipeline(dbName: string, mysqlExit: string): number {
    const pipeline = buildLocalImportPipeline(
      { mysqlBinary: 'mysql', optionFilePath: join(shellDir, 'my.cnf'), dbName },
      dumpPath
    )
    return (
      spawnSync('/bin/bash', ['-c', pipeline], {
        env: {
          PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
          FAKE_MYSQL_EXIT: mysqlExit,
          MYSQL_SINK: sinkPath,
          MYSQL_ARGV: argvPath
        }
      }).status ?? -1
    )
  }

  beforeEach(() => {
    shellDir = mkdtempSync(join(tmpdir(), 'muster-import-shell-'))
    binDir = join(shellDir, 'bin')
    dumpPath = join(shellDir, 'db.sql.gz')
    sinkPath = join(shellDir, 'stdin.sql')
    argvPath = join(shellDir, 'argv.txt')
    mkdirSync(binDir)
    writeFileSync(
      join(binDir, 'mysql'),
      '#!/bin/sh\nprintf "ARG:%s\\n" "$@" > "$MYSQL_ARGV"\ncat > "$MYSQL_SINK"\nexit ${FAKE_MYSQL_EXIT:-0}\n'
    )
    chmodSync(join(binDir, 'mysql'), 0o755)
    writeFileSync(dumpPath, gzipSync(Buffer.from('CREATE TABLE wp_posts (id INT);\n')))
  })

  afterEach(() => {
    rmSync(shellDir, { recursive: true, force: true })
  })

  it('gunzips the dump straight into the client', () => {
    expect(runPipeline('acme_local', '0')).toBe(0)
    expect(readFileSync(sinkPath, 'utf8')).toBe('CREATE TABLE wp_posts (id INT);\n')
  })

  it('fails on a truncated archive instead of importing what decompressed', () => {
    const valid = readFileSync(dumpPath)
    writeFileSync(dumpPath, valid.subarray(0, -4))
    // mysql still exits 0 here — only pipefail can surface gunzip's failure.
    expect(runPipeline('acme_local', '0')).not.toBe(0)
  })

  it('fails when the client rejects the dump', () => {
    expect(runPipeline('acme_local', '1')).not.toBe(0)
  })

  it('keeps a database name containing a quote and a separator as one argument', () => {
    const canary = join(shellDir, 'canary')
    expect(runPipeline(`acme'; touch ${canary}`, '0')).toBe(0)
    expect(existsSync(canary)).toBe(false)
    expect(readFileSync(argvPath, 'utf8')).toContain(`ARG:--database=acme'; touch ${canary}`)
  })
})

describe('importLocalDatabase', () => {
  it('creates the database before importing into it', async () => {
    const { context } = createContext()
    await importLocalDatabase(context, createConfig(), '/tmp/db.sql.gz', 'acme_local')
    const [command, args] = callAt(0)
    expect(command).toBe(FAKE_MYSQL)
    expect(args[1]).toBe('-e')
    expect(args[2]).toBe('CREATE DATABASE IF NOT EXISTS `acme_local`;')
  })

  it('escapes a backtick in the database identifier', async () => {
    const { context } = createContext()
    await importLocalDatabase(context, createConfig(), '/tmp/db.sql.gz', 'we`ird')
    expect(callAt(0)[1][2]).toBe('CREATE DATABASE IF NOT EXISTS `we``ird`;')
  })

  it('runs the import pipeline under bash, because pipefail is not POSIX sh', async () => {
    const { context } = createContext()
    await importLocalDatabase(context, createConfig(), '/tmp/db.sql.gz', 'acme_local')
    const [command, args] = callAt(1)
    expect(command).toBe('/bin/bash')
    expect(args[0]).toBe('-c')
    expect(args[1]).toContain('set -o pipefail')
    expect(args[1]).toContain("gunzip -c '/tmp/db.sql.gz'")
  })

  it('gives neither step a wall-clock deadline', async () => {
    const { context } = createContext()
    await importLocalDatabase(context, createConfig(), '/tmp/db.sql.gz', 'acme_local')
    expect(callAt(0)[2].timeoutMs).toBe(0)
    expect(callAt(1)[2].timeoutMs).toBe(0)
  })

  it('passes the run signal so a cancel kills the client', async () => {
    const { context } = createContext()
    await importLocalDatabase(context, createConfig(), '/tmp/db.sql.gz', 'acme_local')
    expect(callAt(0)[2].signal).toBe(context.signal)
    expect(callAt(1)[2].signal).toBe(context.signal)
  })

  it('writes the credentials to a 0600 option file and deletes it afterwards', async () => {
    let observed: { contents: string; mode: number; path: string } | null = null
    streamCommandMock.mockImplementation(async (_command, args) => {
      const path = args
        .find((arg) => arg.startsWith('--defaults-extra-file='))
        ?.slice('--defaults-extra-file='.length)
      if (path && observed === null) {
        observed = { path, contents: readFileSync(path, 'utf8'), mode: statSync(path).mode & 0o777 }
      }
      return ok()
    })
    const { context } = createContext()
    await importLocalDatabase(
      context,
      createConfig({ dbSocket: '/tmp/mysqld.sock' }),
      '/tmp/db.sql.gz',
      'acme_local'
    )
    expect(observed).not.toBeNull()
    const captured = observed as unknown as { contents: string; mode: number; path: string }
    expect(captured.contents).toContain('password="local-pass"')
    expect(captured.contents).toContain('socket="/tmp/mysqld.sock"')
    expect(captured.mode).toBe(0o600)
    // The temp directory holding it must not outlive the import.
    expect(existsSync(dirname(captured.path))).toBe(false)
  })

  it('removes the temp directory even when the import fails', async () => {
    let optionFilePath = ''
    streamCommandMock.mockImplementation(async (_command, args) => {
      const path = args
        .find((arg) => arg.startsWith('--defaults-extra-file='))
        ?.slice('--defaults-extra-file='.length)
      if (path) {
        optionFilePath = path
      }
      return ok({ code: 1, stderr: 'ERROR 1049 Unknown database' })
    })
    const { context } = createContext()
    await expect(
      importLocalDatabase(context, createConfig(), '/tmp/db.sql.gz', 'acme_local')
    ).rejects.toThrow(SiteRunStepError)
    expect(existsSync(dirname(optionFilePath))).toBe(false)
  })

  it('reports the client error when the database cannot be created', async () => {
    streamCommandMock.mockResolvedValueOnce(ok({ code: 1, stderr: 'ERROR 1044 access denied' }))
    const { context } = createContext()
    await expect(
      importLocalDatabase(context, createConfig(), '/tmp/db.sql.gz', 'acme_local')
    ).rejects.toThrow("Error creating database 'acme_local': ERROR 1044 access denied")
  })

  it('reports the client error when the import fails', async () => {
    streamCommandMock.mockResolvedValueOnce(ok())
    streamCommandMock.mockResolvedValueOnce(ok({ code: 1, stderr: 'ERROR 1064 syntax error' }))
    const { context } = createContext()
    await expect(
      importLocalDatabase(context, createConfig(), '/tmp/db.sql.gz', 'acme_local')
    ).rejects.toThrow("Error importing database 'acme_local': ERROR 1064 syntax error")
  })

  it('falls back to the exit code when the client said nothing', async () => {
    streamCommandMock.mockResolvedValueOnce(ok())
    streamCommandMock.mockResolvedValueOnce(ok({ code: -1 }))
    const { context } = createContext()
    await expect(
      importLocalDatabase(context, createConfig(), '/tmp/db.sql.gz', 'acme_local')
    ).rejects.toThrow('mysql exited -1')
  })

  it('redacts the password out of a failure message', async () => {
    streamCommandMock.mockResolvedValueOnce(ok())
    streamCommandMock.mockResolvedValueOnce(ok({ code: 1, stderr: "denied for 'topsecret'" }))
    const { context } = createContext()
    const failure = importLocalDatabase(
      context,
      createConfig({}, 'topsecret'),
      '/tmp/db.sql.gz',
      'acme_local'
    )
    await expect(failure).rejects.toThrow(/\*{8}/)
    await expect(failure).rejects.not.toThrow(/topsecret/)
  })

  it('streams client warnings into the run log, redacted', async () => {
    streamCommandMock.mockResolvedValueOnce(ok())
    streamCommandMock.mockImplementationOnce(async (_command, _args, options) => {
      options?.onStderr?.('Warning: using topsecret is insecure\n')
      options?.onStderr?.('   \n')
      return ok()
    })
    const recorded = createContext()
    await importLocalDatabase(
      recorded.context,
      createConfig({}, 'topsecret'),
      '/tmp/db.sql.gz',
      'acme_local'
    )
    expect(recorded.logs).toEqual([
      'Warning: using ******** is insecure',
      "Imported database 'acme_local'."
    ])
    expect(recorded.statuses).toEqual(['Importing database'])
  })

  it('stops before creating the database when the run is already cancelled', async () => {
    const { context } = createContext(0)
    await expect(
      importLocalDatabase(context, createConfig(), '/tmp/db.sql.gz', 'acme_local')
    ).rejects.toBeInstanceOf(SiteRunCancelledError)
    expect(streamCommandMock).not.toHaveBeenCalled()
  })

  it('stops between creating and importing when cancelled mid-run', async () => {
    const { context } = createContext(1)
    await expect(
      importLocalDatabase(context, createConfig(), '/tmp/db.sql.gz', 'acme_local')
    ).rejects.toBeInstanceOf(SiteRunCancelledError)
    expect(streamCommandMock).toHaveBeenCalledTimes(1)
  })
})
