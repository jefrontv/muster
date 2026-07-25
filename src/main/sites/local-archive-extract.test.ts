import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  streamCommand,
  type StreamCommandOptions,
  type StreamCommandResult
} from '../lib/stream-command'
import { assertSafeZipEntries, extractZipArchive } from './local-archive-extract'
import { SiteRunCancelledError, type SiteRunContext, SiteRunStepError } from './pipeline-contract'

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

type TestContext = { context: SiteRunContext; logs: string[]; cancel: () => void }

function createTestContext(): TestContext {
  const controller = new AbortController()
  const logs: string[] = []
  return {
    logs,
    cancel: () => controller.abort(),
    context: {
      signal: controller.signal,
      log: (line) => logs.push(line),
      status: () => {},
      progress: () => {},
      throwIfCancelled: () => {
        if (controller.signal.aborted) {
          throw new SiteRunCancelledError()
        }
      }
    }
  }
}

/** Makes `unzip -Z1` report `entries`; every other invocation returns `extractResult`. */
function stubArchive(entries: string[], extractResult = commandResult()): void {
  streamCommandMock.mockImplementation(async (_command, args) =>
    args.includes('-Z1') ? commandResult({ stdout: `${entries.join('\n')}\n` }) : extractResult
  )
}

function extractCalls(): { args: string[]; options: StreamCommandOptions | undefined }[] {
  return streamCommandMock.mock.calls
    .filter(([, args]) => !args.includes('-Z1'))
    .map(([, args, options]) => ({ args, options }))
}

let root: string
let archivePath: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'muster-extract-'))
  archivePath = path.join(root, 'base.zip')
  writeFileSync(archivePath, 'stand-in for a real archive')
  streamCommandMock.mockReset()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('assertSafeZipEntries', () => {
  it('accepts entries that stay inside the target', () => {
    expect(() =>
      assertSafeZipEntries(
        ['wp-admin/', 'wp-admin/index.php', './wp-includes/load.php', 'a/../b.txt'],
        '/site',
        'step'
      )
    ).not.toThrow()
  })

  it('rejects a traversal entry', () => {
    expect(() => assertSafeZipEntries(['../../etc/crontab'], '/site', 'step')).toThrow(
      /Unsafe zip entry blocked: \.\.\/\.\.\/etc\/crontab/
    )
  })

  it('rejects an entry that escapes only after normalisation', () => {
    expect(() => assertSafeZipEntries(['wp-admin/../../outside.txt'], '/site', 'step')).toThrow(
      SiteRunStepError
    )
  })

  it('rejects an absolute entry, posix or windows style', () => {
    expect(() => assertSafeZipEntries(['/etc/passwd'], '/site', 'step')).toThrow(
      /Absolute zip entry blocked/
    )
    expect(() => assertSafeZipEntries([String.raw`C:\Windows\evil`], '/site', 'step')).toThrow(
      /Absolute zip entry blocked/
    )
  })

  it('does not mistake a prefix-sharing sibling directory for the target', () => {
    // '/site-backup/x' starts with the string '/site' but is not inside /site.
    expect(() => assertSafeZipEntries(['../site-backup/x'], '/site', 'step')).toThrow(
      SiteRunStepError
    )
  })
})

describe('extractZipArchive', () => {
  it('validates every entry before extracting anything', async () => {
    const { context } = createTestContext()
    stubArchive(['wp-config.php', '../../../evil.sh'])

    await expect(
      extractZipArchive(context, 'extract-base-archive', archivePath, path.join(root, 'site'))
    ).rejects.toThrow(/Unsafe zip entry blocked/)

    // The guard is worthless if unzip already ran.
    expect(extractCalls()).toHaveLength(0)
  })

  it('extracts into the target with overwrite enabled and no deadline', async () => {
    const { context } = createTestContext()
    stubArchive(['wp-admin/', 'wp-admin/index.php'])
    const target = path.join(root, 'site')

    await extractZipArchive(context, 'extract-base-archive', archivePath, target)

    const calls = extractCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args).toEqual(['-o', '-q', archivePath, '-d', realpathSync(target)])
    // A wall-clock deadline on a multi-GB extraction is how you get a half-extracted webroot.
    expect(calls[0]?.options?.timeoutMs).toBe(0)
    expect(calls[0]?.options?.signal).toBe(context.signal)
  })

  it('creates the target directory when the content dir does not exist yet', async () => {
    const { context } = createTestContext()
    stubArchive(['plugins/akismet/akismet.php'])
    const target = path.join(root, 'wp-content')

    await extractZipArchive(context, 'extract-content-archive', archivePath, target)

    expect(statSync(target).isDirectory()).toBe(true)
  })

  it('clears the read-only bit on files it is about to overwrite', async () => {
    const { context } = createTestContext()
    const target = path.join(root, 'site')
    const readOnly = path.join(target, 'plugin', '.git', 'objects', 'abc123')
    mkdirSync(path.dirname(readOnly), { recursive: true })
    writeFileSync(readOnly, 'object')
    chmodSync(readOnly, 0o444)
    stubArchive(['plugin/.git/objects/abc123'])

    await extractZipArchive(context, 'extract-content-archive', archivePath, target)

    // 0444 would make unzip fail EACCES on a nested plugin checkout.
    expect(statSync(readOnly).mode & 0o200).not.toBe(0)
    expect(readFileSync(readOnly, 'utf8')).toBe('object')
  })

  it('treats a unzip warning exit as success but records it', async () => {
    const { context, logs } = createTestContext()
    stubArchive(['a.txt'], commandResult({ code: 1, stderr: 'warning: mangled path' }))

    await extractZipArchive(context, 'extract-base-archive', archivePath, path.join(root, 'site'))

    expect(logs).toContain('unzip reported warnings for base.zip')
  })

  it('fails the step on a real unzip error', async () => {
    const { context } = createTestContext()
    stubArchive(['a.txt'], commandResult({ code: 2, stderr: 'cannot write to disk' }))

    await expect(
      extractZipArchive(context, 'extract-base-archive', archivePath, path.join(root, 'site'))
    ).rejects.toThrow(/Failed to extract base\.zip: cannot write to disk/)
  })

  it('refuses to extract when the entry list was truncated', async () => {
    const { context } = createTestContext()
    streamCommandMock.mockResolvedValue(commandResult({ stdout: 'a.txt\n', truncated: true }))

    await expect(
      extractZipArchive(context, 'extract-base-archive', archivePath, path.join(root, 'site'))
    ).rejects.toThrow(/too many entries to validate safely/)
  })

  it('reports an unreadable archive with the unzip stderr', async () => {
    const { context } = createTestContext()
    streamCommandMock.mockResolvedValue(
      commandResult({ code: 9, stderr: 'cannot find zipfile directory' })
    )

    await expect(
      extractZipArchive(context, 'extract-base-archive', archivePath, path.join(root, 'site'))
    ).rejects.toThrow(/Could not read base\.zip: cannot find zipfile directory/)
  })

  it('explains how to install unzip when the binary is missing', async () => {
    const { context } = createTestContext()
    streamCommandMock.mockRejectedValue(
      Object.assign(new Error('spawn unzip ENOENT'), { code: 'ENOENT' })
    )

    await expect(
      extractZipArchive(context, 'extract-base-archive', archivePath, path.join(root, 'site'))
    ).rejects.toThrow(/`unzip` command is required/)
  })

  it('turns an abort into a cancellation rather than a step failure', async () => {
    const { context } = createTestContext()
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    streamCommandMock.mockRejectedValue(abortError)

    await expect(
      extractZipArchive(context, 'extract-base-archive', archivePath, path.join(root, 'site'))
    ).rejects.toThrow(SiteRunCancelledError)
  })

  it('stops between listing and extracting when the run is cancelled', async () => {
    const { context, cancel } = createTestContext()
    streamCommandMock.mockImplementation(async (_command, args) => {
      if (args.includes('-Z1')) {
        cancel()
        return commandResult({ stdout: 'a.txt\n' })
      }
      return commandResult()
    })

    await expect(
      extractZipArchive(context, 'extract-base-archive', archivePath, path.join(root, 'site'))
    ).rejects.toThrow(SiteRunCancelledError)
    expect(extractCalls()).toHaveLength(0)
  })
})
