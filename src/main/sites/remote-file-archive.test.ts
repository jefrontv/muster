import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySiteEnvironment, type Site } from '../../shared/site-types'
import {
  type RemoteLayout,
  SiteRunCancelledError,
  type SiteRunConfig,
  type SiteRunContext,
  type SiteRunProgress,
  SiteRunStepError,
  type SiteSshSession
} from './pipeline-contract'
import {
  BASE_ARCHIVE_NAME,
  buildPruneZipCommand,
  pullRemoteFileArchives,
  SITE_TEMP_ARCHIVE_NAMES
} from './remote-file-archive'

type TestContext = {
  context: SiteRunContext
  statuses: string[]
  progress: SiteRunProgress[]
  cancel: () => void
}

function createTestContext(): TestContext {
  const controller = new AbortController()
  const statuses: string[] = []
  const progress: SiteRunProgress[] = []
  return {
    statuses,
    progress,
    cancel: () => controller.abort(),
    context: {
      signal: controller.signal,
      log: () => {},
      status: (stage) => statuses.push(stage),
      progress: (entry) => progress.push(entry),
      throwIfCancelled: () => {
        if (controller.signal.aborted) {
          throw new SiteRunCancelledError()
        }
      }
    }
  }
}

type FakeSession = SiteSshSession & {
  commands: string[]
  downloads: { remotePath: string; localPath: string }[]
  removed: string[]
}

function createFakeSession(overrides: Partial<SiteSshSession> = {}): FakeSession {
  const commands: string[] = []
  const downloads: { remotePath: string; localPath: string }[] = []
  const removed: string[] = []
  return {
    commands,
    downloads,
    removed,
    exec: async (command) => {
      commands.push(command)
      return { code: 0, stdout: '', stderr: '' }
    },
    download: async (remotePath, localPath, onProgress) => {
      downloads.push({ remotePath, localPath })
      onProgress?.(512, 1024)
    },
    upload: async () => {},
    writeSecureRemoteFile: async () => {},
    removeRemoteFile: async (remotePath) => {
      removed.push(remotePath)
    },
    close: async () => {},
    ...overrides
  }
}

let wpDir: string

beforeEach(() => {
  wpDir = mkdtempSync(path.join(tmpdir(), 'muster-archive-'))
})

afterEach(() => {
  rmSync(wpDir, { recursive: true, force: true })
})

function createConfig(): SiteRunConfig {
  const environment = { ...createEmptySiteEnvironment(), hostname: 'srv', username: 'deploy' }
  const site: Site = {
    id: 'site-1',
    path: wpDir,
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
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
    sshPassword: 'secret',
    dbPassword: 'secret'
  }
}

const STANDARD_LAYOUT: RemoteLayout = { webroot: 'public_html', contentDir: 'wp-content' }

describe('buildPruneZipCommand', () => {
  it('prunes rather than excludes, so a huge uploads tree is never walked', () => {
    const command = buildPruneZipCommand(
      'public_html/wp-content',
      'wp-content.zip',
      ['themes', 'cache', 'uploads', 'webp-express', 'upgrade-temp-backup'],
      ['*.zip', '*.tar.gz', 'debug.log']
    )
    // -prune stops find descending; `zip -x 'uploads/*'` would still walk every file to test it.
    expect(command).toContain(String.raw`-path './uploads'`)
    expect(command).toContain('-prune')
    expect(command).not.toContain('-x')
    expect(command).not.toContain("-r '.'")
  })

  it('reads the surviving file list from stdin and quotes every interpolated value', () => {
    const command = buildPruneZipCommand("we'ird/dir", 'base.zip', ['.git'], ['*.zip'])
    expect(command).toBe(
      String.raw`cd 'we'\''ird/dir' && find . \( -path './.git' \) -prune -o -type f ! -name '*.zip' -print | zip -q 'base.zip' -@`
    )
  })

  it('excludes the globs by name so zip never adds a nested archive to itself', () => {
    const command = buildPruneZipCommand('root', 'base.zip', ['.git'], ['*.zip', '.gitignore'])
    expect(command).toContain(String.raw`! -name '*.zip' ! -name '.gitignore'`)
  })
})

describe('pullRemoteFileArchives', () => {
  it('zips and downloads the webroot without the content tree, then the content tree', async () => {
    const { context, statuses, progress } = createTestContext()
    const session = createFakeSession()

    const result = await pullRemoteFileArchives(context, createConfig(), session, STANDARD_LAYOUT)

    expect(session.commands).toHaveLength(2)
    // base.zip prunes the content dir; it is pulled by the second archive instead.
    expect(session.commands[0]).toContain("cd 'public_html'")
    expect(session.commands[0]).toContain(String.raw`-path './wp-content'`)
    expect(session.commands[0]).toContain(String.raw`-path './.git'`)
    expect(session.commands[1]).toContain("cd 'public_html/wp-content'")
    expect(session.commands[1]).toContain(String.raw`-path './uploads'`)

    expect(session.downloads).toEqual([
      { remotePath: 'public_html/base.zip', localPath: path.join(wpDir, 'base.zip') },
      {
        remotePath: 'public_html/wp-content/wp-content.zip',
        localPath: path.join(wpDir, 'wp-content.zip')
      }
    ])
    expect(result).toEqual({
      baseArchivePath: path.join(wpDir, 'base.zip'),
      contentArchivePath: path.join(wpDir, 'wp-content.zip'),
      contentDirectoryName: 'wp-content'
    })
    expect(statuses).toContain('Creating base.zip…')
    expect(statuses).toContain('Downloading wp-content.zip…')
    expect(progress).toContainEqual({
      label: 'Downloading base.zip',
      transferred: 512,
      total: 1024
    })
  })

  it('uses the Bedrock content directory for both the zip name and the remote path', async () => {
    const { context } = createTestContext()
    const session = createFakeSession()

    const result = await pullRemoteFileArchives(context, createConfig(), session, {
      webroot: 'bedrock/web',
      contentDir: 'app'
    })

    expect(session.commands[1]).toContain("cd 'bedrock/web/app'")
    expect(session.commands[1]).toContain("zip -q 'app.zip' -@")
    expect(session.downloads[1]?.remotePath).toBe('bedrock/web/app/app.zip')
    expect(result.contentDirectoryName).toBe('app')
    // 'app.zip' is why the temp-artifact list carries the Bedrock name too.
    expect(SITE_TEMP_ARCHIVE_NAMES).toContain('app.zip')
  })

  it('fails the step with the remote stderr when zip cannot be created', async () => {
    const { context } = createTestContext()
    const session = createFakeSession({
      exec: async () => ({ code: 12, stdout: '', stderr: 'zip error: Nothing to do!\n' })
    })

    await expect(
      pullRemoteFileArchives(context, createConfig(), session, STANDARD_LAYOUT)
    ).rejects.toThrow(SiteRunStepError)
    await expect(
      pullRemoteFileArchives(context, createConfig(), session, STANDARD_LAYOUT)
    ).rejects.toThrow(/zip error: Nothing to do!/)
    expect(session.downloads).toHaveLength(0)
  })

  it('deletes the remote zip even when the download fails', async () => {
    const { context } = createTestContext()
    const session = createFakeSession({
      download: async () => {
        throw new Error('sftp died')
      }
    })

    await expect(
      pullRemoteFileArchives(context, createConfig(), session, STANDARD_LAYOUT)
    ).rejects.toThrow('sftp died')
    // Otherwise a failed run orphans a multi-hundred-MB zip in the customer's webroot.
    expect(session.removed).toEqual(['public_html/base.zip'])
  })

  it('deletes both remote zips on the success path', async () => {
    const { context } = createTestContext()
    const session = createFakeSession()

    await pullRemoteFileArchives(context, createConfig(), session, STANDARD_LAYOUT)

    expect(session.removed).toEqual([
      'public_html/base.zip',
      'public_html/wp-content/wp-content.zip'
    ])
  })

  it('stops between the two archives when the run is cancelled', async () => {
    const { context, cancel } = createTestContext()
    const session = createFakeSession()
    const download = vi.fn(async () => {
      cancel()
    })

    await expect(
      pullRemoteFileArchives(context, createConfig(), { ...session, download }, STANDARD_LAYOUT)
    ).rejects.toThrow(SiteRunCancelledError)
    expect(download).toHaveBeenCalledTimes(1)
    expect(session.commands).toHaveLength(1)
  })

  it('names the base archive consistently with the temp-artifact list', () => {
    expect(SITE_TEMP_ARCHIVE_NAMES).toContain(BASE_ARCHIVE_NAME)
  })
})
