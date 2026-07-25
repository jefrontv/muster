import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractZipArchive } from './local-archive-extract'
import {
  SiteRunCancelledError,
  SiteRunStepError,
  type RemoteLayout,
  type SiteRunConfig
} from './pipeline-contract'
import { normalizeUploadsSubdir, syncUploadsFromRemote } from './remote-uploads-sync'
import {
  createFakeSshSession,
  createToolConfig,
  createToolTestContext,
  type FakeExecHandler,
  type ToolTestContext
} from './site-tool-test-fixtures'

// The real extract shells out to `unzip`; here it materialises whatever the archive is supposed to
// have contained, so these tests exercise the sync logic rather than the zip binary.
vi.mock('./local-archive-extract', () => ({ extractZipArchive: vi.fn() }))

const extractMock = vi.mocked(extractZipArchive)

const STANDARD_LAYOUT: RemoteLayout = { webroot: 'public_html', contentDir: 'wp-content' }
const REMOTE_ZIP_BYTES = 4096

let wpDir: string
let downloadDir: string
let harness: ToolTestContext

beforeEach(() => {
  wpDir = mkdtempSync(path.join(tmpdir(), 'muster-uploads-'))
  downloadDir = mkdtempSync(path.join(tmpdir(), 'muster-downloads-'))
  harness = createToolTestContext()
  extractMock.mockReset()
})

afterEach(() => {
  rmSync(wpDir, { recursive: true, force: true })
  rmSync(downloadDir, { recursive: true, force: true })
})

function seedLocalUploads(contentDir = 'wp-content'): string {
  const uploads = path.join(wpDir, contentDir, 'uploads')
  mkdirSync(path.join(uploads, '2025'), { recursive: true })
  writeFileSync(path.join(uploads, '2025', 'old.jpg'), 'old')
  return uploads
}

/** Answers the existence probe and the size read the fetch primitive makes. */
const remoteHandler: FakeExecHandler = (command) => {
  if (command.startsWith('stat -c %s')) {
    return { stdout: `${REMOTE_ZIP_BYTES}\n` }
  }
  return undefined
}

type DownloadScript = {
  /** Emits these (transferred, total) pairs before finishing. */
  progress?: [number, number][]
  /** Runs after the progress emits; throw here to simulate an aborted transfer. */
  after?: () => void
}

function scriptedDownload(script: DownloadScript = {}) {
  return async (
    _remotePath: string,
    localPath: string,
    onProgress?: (transferred: number, total: number) => void
  ): Promise<void> => {
    for (const [transferred, total] of script.progress ?? [[REMOTE_ZIP_BYTES, REMOTE_ZIP_BYTES]]) {
      onProgress?.(transferred, total)
    }
    script.after?.()
    writeFileSync(localPath, 'PK\u0003\u0004')
  }
}

/** Stands in for `unzip`: writes the payload the archive claimed to hold. */
function extractsRemoteTree(entries: Record<string, string>): void {
  extractMock.mockImplementation(async (_context, _step, _archive, target) => {
    for (const [relative, contents] of Object.entries(entries)) {
      const destination = path.join(target, relative)
      mkdirSync(path.dirname(destination), { recursive: true })
      writeFileSync(destination, contents)
    }
  })
}

function config(overrides: Parameters<typeof createToolConfig>[1] = {}): SiteRunConfig {
  return createToolConfig(wpDir, overrides)
}

describe('normalizeUploadsSubdir', () => {
  it.each([
    ['2026', '2026'],
    ['2026/05', '2026/05'],
    ['uploads/2026', '2026'],
    ['wp-content/uploads/2026/05', '2026/05'],
    ['app/uploads/sites/3', 'sites/3'],
    ['/2026/', '2026']
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeUploadsSubdir(input)).toBe(expected)
  })

  it.each([['uploads'], ['wp-content/uploads'], ['app/uploads'], ['/']])(
    'refuses %s, which would widen into replacing the whole library',
    (input) => {
      expect(() => normalizeUploadsSubdir(input)).toThrow(SiteRunStepError)
    }
  )

  it.each([['../../etc'], ['2026/../../etc'], ['2026/*'], ['2026;rm -rf /']])(
    'refuses the unsafe path %s',
    (input) => {
      expect(() => normalizeUploadsSubdir(input)).toThrow(SiteRunStepError)
    }
  )
})

describe('syncUploadsFromRemote', () => {
  it('streams byte progress for the download', async () => {
    seedLocalUploads()
    extractsRemoteTree({ 'wp-content/uploads/2026/new.jpg': 'new' })
    const fake = createFakeSshSession(
      remoteHandler,
      scriptedDownload({
        progress: [
          [1024, REMOTE_ZIP_BYTES],
          [2048, REMOTE_ZIP_BYTES],
          [REMOTE_ZIP_BYTES, REMOTE_ZIP_BYTES]
        ]
      })
    )

    await syncUploadsFromRemote(harness.context, config(), fake.session, STANDARD_LAYOUT, {
      downloadDir,
      maxZipSizeMb: 1024,
      backup: false
    })

    expect(harness.progress).toEqual([
      { label: 'Downloading uploads', transferred: 1024, total: REMOTE_ZIP_BYTES },
      { label: 'Downloading uploads', transferred: 2048, total: REMOTE_ZIP_BYTES },
      { label: 'Downloading uploads', transferred: REMOTE_ZIP_BYTES, total: REMOTE_ZIP_BYTES }
    ])
    expect(harness.statuses.some((status) => status.includes('Syncing uploads'))).toBe(true)
  })

  it('replaces the local uploads directory and keeps a backup', async () => {
    const uploads = seedLocalUploads()
    extractsRemoteTree({ 'wp-content/uploads/2026/new.jpg': 'new' })
    const fake = createFakeSshSession(remoteHandler, scriptedDownload())

    const outcome = await syncUploadsFromRemote(
      harness.context,
      config(),
      fake.session,
      STANDARD_LAYOUT,
      { downloadDir, maxZipSizeMb: 1024, backup: true }
    )

    expect(outcome.target).toBe(uploads)
    expect(existsSync(path.join(uploads, '2026', 'new.jpg'))).toBe(true)
    expect(existsSync(path.join(uploads, '2025', 'old.jpg'))).toBe(false)
    expect(outcome.backupPath).not.toBeNull()
    expect(existsSync(path.join(outcome.backupPath ?? '', '2025', 'old.jpg'))).toBe(true)
    // The remote temp archive is always removed, success or not.
    expect(fake.removed).toHaveLength(1)
  })

  it('deletes the old directory outright when no backup is asked for', async () => {
    seedLocalUploads()
    extractsRemoteTree({ 'wp-content/uploads/2026/new.jpg': 'new' })
    const fake = createFakeSshSession(remoteHandler, scriptedDownload())

    const outcome = await syncUploadsFromRemote(
      harness.context,
      config(),
      fake.session,
      STANDARD_LAYOUT,
      { downloadDir, maxZipSizeMb: 1024, backup: false }
    )
    expect(outcome.backupPath).toBeNull()
    expect(readdirSync(path.join(wpDir, 'wp-content'))).toEqual(['uploads'])
  })

  it('honours cancellation mid-download and leaves the local library untouched', async () => {
    const uploads = seedLocalUploads()
    extractsRemoteTree({ 'wp-content/uploads/2026/new.jpg': 'new' })
    const fake = createFakeSshSession(
      remoteHandler,
      scriptedDownload({
        progress: [[512, REMOTE_ZIP_BYTES]],
        // What the real session does once its signal fires: end the transfer as a cancellation.
        after: () => {
          harness.cancel()
          throw new SiteRunCancelledError()
        }
      })
    )

    await expect(
      syncUploadsFromRemote(harness.context, config(), fake.session, STANDARD_LAYOUT, {
        downloadDir,
        maxZipSizeMb: 1024,
        backup: true
      })
    ).rejects.toThrow(SiteRunCancelledError)

    expect(harness.progress).toEqual([
      { label: 'Downloading uploads', transferred: 512, total: REMOTE_ZIP_BYTES }
    ])
    expect(existsSync(path.join(uploads, '2025', 'old.jpg'))).toBe(true)
    expect(extractMock).not.toHaveBeenCalled()
    expect(fake.removed).toHaveLength(1)
  })

  it('refuses before downloading when the remote archive is over the size cap', async () => {
    seedLocalUploads()
    let downloaded = false
    const fake = createFakeSshSession(
      (command) =>
        command.startsWith('stat -c %s') ? { stdout: `${400 * 1024 * 1024}\n` } : undefined,
      async () => {
        downloaded = true
      }
    )

    await expect(
      syncUploadsFromRemote(harness.context, config(), fake.session, STANDARD_LAYOUT, {
        downloadDir,
        maxZipSizeMb: 1,
        backup: false
      })
    ).rejects.toThrow(/over the 1\.0 MB cap/)
    expect(downloaded).toBe(false)
  })

  it('installs a single subdirectory without touching its siblings', async () => {
    const uploads = seedLocalUploads()
    extractsRemoteTree({ 'wp-content/uploads/2026/05/new.jpg': 'new' })
    const fake = createFakeSshSession(remoteHandler, scriptedDownload())

    const outcome = await syncUploadsFromRemote(
      harness.context,
      config(),
      fake.session,
      STANDARD_LAYOUT,
      { downloadDir, maxZipSizeMb: 1024, backup: false, subdir: 'uploads/2026/05' }
    )

    expect(outcome.subdir).toBe('2026/05')
    expect(outcome.target).toBe(path.join(uploads, '2026', '05'))
    expect(existsSync(path.join(uploads, '2026', '05', 'new.jpg'))).toBe(true)
    expect(existsSync(path.join(uploads, '2025', 'old.jpg'))).toBe(true)
    expect(fake.commands.some((command) => command.includes("'wp-content/uploads/2026/05'"))).toBe(
      true
    )
  })

  it('targets app/uploads for a Bedrock checkout even when the server is standard', async () => {
    // Local Bedrock: core under wp/, content under app/. ocsites hardcoded wp-content on both
    // sides, so this landed in a directory WordPress never reads.
    mkdirSync(path.join(wpDir, 'wp'), { recursive: true })
    writeFileSync(path.join(wpDir, 'wp', 'wp-load.php'), '<?php')
    const uploads = seedLocalUploads('app')
    extractsRemoteTree({ 'wp-content/uploads/2026/new.jpg': 'new' })
    const fake = createFakeSshSession(remoteHandler, scriptedDownload())

    const outcome = await syncUploadsFromRemote(
      harness.context,
      config(),
      fake.session,
      STANDARD_LAYOUT,
      { downloadDir, maxZipSizeMb: 1024, backup: false }
    )
    expect(outcome.target).toBe(uploads)
    expect(existsSync(path.join(wpDir, 'app', 'uploads', '2026', 'new.jpg'))).toBe(true)
  })

  it('refuses when the checkout has no content directory to sync into', async () => {
    const fake = createFakeSshSession(remoteHandler, scriptedDownload())
    await expect(
      syncUploadsFromRemote(harness.context, config(), fake.session, STANDARD_LAYOUT, {
        downloadDir,
        maxZipSizeMb: 1024,
        backup: false
      })
    ).rejects.toThrow(/No local wp-content directory/)
  })

  it('reports a path the server does not have instead of writing an empty directory', async () => {
    seedLocalUploads()
    const fake = createFakeSshSession(
      (command) => (command.startsWith('test -e') ? { code: 1 } : remoteHandler(command)),
      scriptedDownload()
    )
    await expect(
      syncUploadsFromRemote(harness.context, config(), fake.session, STANDARD_LAYOUT, {
        downloadDir,
        maxZipSizeMb: 1024,
        backup: false
      })
    ).rejects.toThrow(/None of the requested paths exist/)
  })
})
