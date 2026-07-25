import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptySiteEnvironment, type Site } from '../../shared/site-types'
import {
  SiteRunCancelledError,
  SiteRunStepError,
  type SiteExecOptions,
  type SiteExecResult,
  type SiteRunConfig,
  type SiteRunContext,
  type SiteRunProgress,
  type SiteSshSession
} from './pipeline-contract'
import {
  buildRemoteDumpCommand,
  dumpAndDownloadRemoteDatabase,
  LOCAL_DUMP_FILENAME
} from './remote-database-dump'

const CREDENTIALS = { name: 'acme_live', user: 'acme_user', password: 'acme_pass' }

let wpDir = ''

type RecordedContext = {
  context: SiteRunContext
  logs: string[]
  statuses: string[]
  progress: SiteRunProgress[]
}

function createContext(cancelled = false): RecordedContext {
  const recorded: RecordedContext = {
    logs: [],
    statuses: [],
    progress: [],
    context: {
      signal: new AbortController().signal,
      log: (line) => recorded.logs.push(line),
      status: (stage) => recorded.statuses.push(stage),
      progress: (value) => recorded.progress.push(value),
      throwIfCancelled: () => {
        if (cancelled) {
          throw new SiteRunCancelledError()
        }
      }
    }
  }
  return recorded
}

function createConfig(): SiteRunConfig {
  const site: Site = {
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
    searchReplaceTimeoutSeconds: 0
  }
  return {
    site,
    environmentName: 'main',
    environment: site.environments.main,
    group: 'import',
    wpDir,
    sshPassword: '',
    dbPassword: 'local-pass'
  }
}

type FakeSession = {
  session: SiteSshSession
  commands: { command: string; options?: SiteExecOptions }[]
  written: { path: string; contents: string }[]
  removed: string[]
}

type FakeSessionBehaviour = {
  exec?: Partial<SiteExecResult>
  /** Bytes the download writes locally; null means the download produces no file at all. */
  downloadBytes?: string | null
}

function createFakeSession(behaviour: FakeSessionBehaviour = {}): FakeSession {
  const fake: FakeSession = {
    commands: [],
    written: [],
    removed: [],
    session: {
      exec: async (command, options) => {
        fake.commands.push({ command, options })
        return { code: 0, stdout: '', stderr: '', ...behaviour.exec }
      },
      download: async (_remotePath, localPath, onProgress) => {
        const bytes =
          behaviour.downloadBytes === undefined ? 'gzipped-bytes' : behaviour.downloadBytes
        if (bytes === null) {
          return
        }
        writeFileSync(localPath, bytes)
        onProgress?.(bytes.length, bytes.length)
      },
      upload: async () => undefined,
      writeSecureRemoteFile: async (path, contents) => {
        fake.written.push({ path, contents })
      },
      removeRemoteFile: async (path) => {
        fake.removed.push(path)
      },
      close: async () => undefined
    }
  }
  return fake
}

beforeEach(() => {
  wpDir = mkdtempSync(join(tmpdir(), 'muster-db-dump-'))
})

afterEach(() => {
  rmSync(wpDir, { recursive: true, force: true })
})

describe('buildRemoteDumpCommand', () => {
  it('sets pipefail so a dump that dies mid-stream fails the step', () => {
    // Without this, gzip's success masks mysqldump's failure and the truncated .gz imports
    // silently as a corrupt database. This assertion is the whole reason the test exists.
    expect(buildRemoteDumpCommand('/r/.cnf', 'acme', '/r/db.sql.gz')).toContain('set -o pipefail')
  })

  it('runs the pipeline under bash, because pipefail is not POSIX sh', () => {
    expect(buildRemoteDumpCommand('/r/.cnf', 'acme', '/r/db.sql.gz')).toMatch(/^bash -c /)
  })

  it('passes credentials by option file, never on the command line', () => {
    const command = buildRemoteDumpCommand('/r/.cnf', 'acme', '/r/db.sql.gz')
    expect(command).toContain('--defaults-extra-file=')
    expect(command).not.toContain('--password')
  })

  it('pipes through gzip into the dump path', () => {
    expect(buildRemoteDumpCommand('/r/.cnf', 'acme', '/r/db.sql.gz')).toContain('| gzip > ')
  })
})

// The quoting and pipefail claims above are only worth anything if a real shell agrees, so run
// the generated command against a stub mysqldump on PATH rather than eyeballing escape sequences.
describe.skipIf(process.platform === 'win32')('buildRemoteDumpCommand under a real shell', () => {
  let shellDir = ''
  let binDir = ''

  function runGeneratedCommand(dbName: string, dumpExit: string): { status: number } {
    const command = buildRemoteDumpCommand(
      join(shellDir, 'my.cnf'),
      dbName,
      join(shellDir, 'db.sql.gz')
    )
    const result = spawnSync('/bin/sh', ['-c', command], {
      env: { PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`, FAKE_DUMP_EXIT: dumpExit }
    })
    return { status: result.status ?? -1 }
  }

  beforeEach(() => {
    shellDir = mkdtempSync(join(tmpdir(), 'muster-dump-shell-'))
    binDir = join(shellDir, 'bin')
    mkdirSync(binDir)
    writeFileSync(
      join(binDir, 'mysqldump'),
      '#!/bin/sh\nprintf "ARG:%s\\n" "$@"\nexit ${FAKE_DUMP_EXIT:-0}\n'
    )
    chmodSync(join(binDir, 'mysqldump'), 0o755)
  })

  afterEach(() => {
    rmSync(shellDir, { recursive: true, force: true })
  })

  it('keeps a database name containing a quote and a command separator as one argument', () => {
    const canary = join(shellDir, 'canary')
    expect(runGeneratedCommand(`acme'; touch ${canary}`, '0').status).toBe(0)
    // If the quoting leaked, the shell would have run `touch` as a second command.
    expect(existsSync(canary)).toBe(false)
    const dumped = gunzipSync(readFileSync(join(shellDir, 'db.sql.gz'))).toString('utf8')
    expect(dumped).toContain(`ARG:acme'; touch ${canary}`)
  })

  it('fails the whole pipeline when mysqldump dies, even though gzip succeeded', () => {
    expect(runGeneratedCommand('acme', '1').status).not.toBe(0)
    // The truncated archive is still there and still valid — that is precisely why pipefail,
    // and not the presence of an output file, has to be what decides success.
    expect(existsSync(join(shellDir, 'db.sql.gz'))).toBe(true)
  })

  it('succeeds when mysqldump succeeds', () => {
    expect(runGeneratedCommand('acme', '0').status).toBe(0)
  })
})

describe('dumpAndDownloadRemoteDatabase', () => {
  it('dumps, downloads and reports the local path', async () => {
    const { context } = createContext()
    const fake = createFakeSession()
    await expect(
      dumpAndDownloadRemoteDatabase(context, createConfig(), fake.session, CREDENTIALS)
    ).resolves.toEqual({
      localDumpPath: join(wpDir, LOCAL_DUMP_FILENAME),
      remoteDbName: 'acme_live'
    })
    expect(existsSync(join(wpDir, LOCAL_DUMP_FILENAME))).toBe(true)
  })

  it('writes a 0600 option file holding the credentials', async () => {
    const { context } = createContext()
    const fake = createFakeSession()
    await dumpAndDownloadRemoteDatabase(context, createConfig(), fake.session, CREDENTIALS)
    expect(fake.written).toEqual([
      {
        path: 'public_html/.muster-dump.cnf',
        contents: '[client]\nuser="acme_user"\npassword="acme_pass"\n'
      }
    ])
    expect(fake.commands[0].command).not.toContain('acme_pass')
  })

  it('gives mysqldump no wall-clock deadline', async () => {
    const { context } = createContext()
    const fake = createFakeSession()
    await dumpAndDownloadRemoteDatabase(context, createConfig(), fake.session, CREDENTIALS)
    expect(fake.commands[0].options).toEqual({ timeoutMs: 0 })
  })

  it('removes the option file and the remote dump on success', async () => {
    const { context } = createContext()
    const fake = createFakeSession()
    await dumpAndDownloadRemoteDatabase(context, createConfig(), fake.session, CREDENTIALS)
    expect(fake.removed).toEqual([
      'public_html/.muster-dump.cnf',
      `public_html/${LOCAL_DUMP_FILENAME}`
    ])
  })

  it('reports byte progress while downloading', async () => {
    const recorded = createContext()
    const fake = createFakeSession({ downloadBytes: 'abcd' })
    await dumpAndDownloadRemoteDatabase(recorded.context, createConfig(), fake.session, CREDENTIALS)
    expect(recorded.progress).toEqual([{ label: 'Downloading database', transferred: 4, total: 4 }])
    expect(recorded.statuses).toEqual(['Creating database dump', 'Downloading database backup'])
  })

  it('fails with the remote stderr when mysqldump exits non-zero', async () => {
    const { context } = createContext()
    const fake = createFakeSession({ exec: { code: 2, stderr: 'Unknown database acme_live' } })
    await expect(
      dumpAndDownloadRemoteDatabase(context, createConfig(), fake.session, CREDENTIALS)
    ).rejects.toThrow('Error creating database backup: Unknown database acme_live')
  })

  it('still deletes the credentials file when the dump fails', async () => {
    const { context } = createContext()
    const fake = createFakeSession({ exec: { code: 2, stderr: 'boom' } })
    await expect(
      dumpAndDownloadRemoteDatabase(context, createConfig(), fake.session, CREDENTIALS)
    ).rejects.toThrow(SiteRunStepError)
    expect(fake.removed).toContain('public_html/.muster-dump.cnf')
  })

  it('falls back to the exit code when the remote said nothing', async () => {
    const { context } = createContext()
    const fake = createFakeSession({ exec: { code: 137 } })
    await expect(
      dumpAndDownloadRemoteDatabase(context, createConfig(), fake.session, CREDENTIALS)
    ).rejects.toThrow('Error creating database backup: mysqldump exited 137')
  })

  it('rejects a zero-byte dump before anything can import it', async () => {
    const { context } = createContext()
    const fake = createFakeSession({ downloadBytes: '' })
    await expect(
      dumpAndDownloadRemoteDatabase(context, createConfig(), fake.session, CREDENTIALS)
    ).rejects.toThrow('Downloaded database dump is empty — aborting import.')
  })

  it('cleans up the remote side even when the dump turns out to be empty', async () => {
    const { context } = createContext()
    const fake = createFakeSession({ downloadBytes: '' })
    await expect(
      dumpAndDownloadRemoteDatabase(context, createConfig(), fake.session, CREDENTIALS)
    ).rejects.toThrow(SiteRunStepError)
    expect(fake.removed).toHaveLength(2)
  })

  it('reports a dump that never arrived', async () => {
    const { context } = createContext()
    const fake = createFakeSession({ downloadBytes: null })
    await expect(
      dumpAndDownloadRemoteDatabase(context, createConfig(), fake.session, CREDENTIALS)
    ).rejects.toThrow(/Database dump missing after download/)
  })

  it('refuses to start without complete credentials', async () => {
    const { context } = createContext()
    for (const credentials of [
      { name: '', user: 'u', password: 'p' },
      { name: 'n', user: '', password: 'p' },
      { name: 'n', user: 'u', password: '' }
    ]) {
      const fake = createFakeSession()
      await expect(
        dumpAndDownloadRemoteDatabase(context, createConfig(), fake.session, credentials)
      ).rejects.toThrow('Could not retrieve database credentials from wp-config.php.')
      expect(fake.written).toEqual([])
      expect(fake.removed).toEqual([])
    }
  })

  it('aborts after writing the option file when the run is cancelled', async () => {
    const { context } = createContext(true)
    const fake = createFakeSession()
    await expect(
      dumpAndDownloadRemoteDatabase(context, createConfig(), fake.session, CREDENTIALS)
    ).rejects.toBeInstanceOf(SiteRunCancelledError)
    expect(fake.commands).toEqual([])
    expect(fake.removed).toHaveLength(2)
  })
})
