import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamCommand } from '../lib/stream-command'
import { extractZipArchive } from './local-archive-extract'
import { diffPluginInventories, parseWpPluginList, type PluginInventory } from './plugin-inventory'
import { SiteRunStepError, type RemoteLayout } from './pipeline-contract'
import { comparePlugins, syncPluginFromRemote } from './remote-plugin-sync'
import {
  createFakeSshSession,
  createToolConfig,
  createToolTestContext,
  type FakeExecHandler,
  type ToolTestContext
} from './site-tool-test-fixtures'

vi.mock('../lib/stream-command', () => ({ streamCommand: vi.fn() }))
vi.mock('./local-archive-extract', () => ({ extractZipArchive: vi.fn() }))

const streamCommandMock = vi.mocked(streamCommand)
const extractMock = vi.mocked(extractZipArchive)

const STANDARD_LAYOUT: RemoteLayout = { webroot: 'public_html', contentDir: 'wp-content' }
const REMOTE_ZIP_BYTES = 2048

let wpDir: string
let downloadDir: string
let harness: ToolTestContext

beforeEach(() => {
  wpDir = mkdtempSync(path.join(tmpdir(), 'muster-plugins-'))
  downloadDir = mkdtempSync(path.join(tmpdir(), 'muster-plugin-dl-'))
  harness = createToolTestContext()
  extractMock.mockReset()
  streamCommandMock.mockReset()
  // No local WP-CLI in these tests: the directory scan is the interesting fallback.
  streamCommandMock.mockRejectedValue(new Error('spawn wp ENOENT'))
})

afterEach(() => {
  rmSync(wpDir, { recursive: true, force: true })
  rmSync(downloadDir, { recursive: true, force: true })
})

function seedLocalPlugin(slug: string, version: string, mainFile = `${slug}.php`): string {
  const directory = path.join(wpDir, 'wp-content', 'plugins', slug)
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    path.join(directory, mainFile),
    `<?php\n/*\nPlugin Name: ${slug}\nVersion: ${version}\n*/\n`
  )
  return directory
}

function remotePluginListJson(entries: [string, string, string][]): string {
  return JSON.stringify(entries.map(([name, version, status]) => ({ name, version, status })))
}

/** Answers plugin discovery, the WP-CLI list, and the fetch primitive's probes. */
function remoteHandler(options: {
  slugs?: string[]
  pluginListJson?: string
  pluginListCode?: number
  headerLoop?: string
}): FakeExecHandler {
  return (command) => {
    if (command.startsWith('stat -c %s')) {
      return { stdout: `${REMOTE_ZIP_BYTES}\n` }
    }
    if (command.startsWith('find ') && command.includes('/plugins')) {
      return {
        stdout: (options.slugs ?? [])
          .map((slug) => `public_html/wp-content/plugins/${slug}`)
          .join('\n')
      }
    }
    if (command.includes("'plugin' 'list'")) {
      return { code: options.pluginListCode ?? 0, stdout: options.pluginListJson ?? '[]' }
    }
    if (command.startsWith('for d in')) {
      return { stdout: options.headerLoop ?? '' }
    }
    return undefined
  }
}

describe('diffPluginInventories', () => {
  const local = {
    'only-here': { name: 'only-here', version: '1.0', status: 'active' },
    'both-same': { name: 'both-same', version: '2.1', status: 'active' },
    'both-different': { name: 'both-different', version: '3.0', status: 'active' }
  }
  const remote = {
    'only-there': { name: 'only-there', version: '9.9', status: 'inactive' },
    'both-same': { name: 'both-same', version: '2.1', status: 'active' },
    'both-different': { name: 'both-different', version: '2.4', status: 'active' }
  }

  it('classifies added, removed, changed and identical plugins', () => {
    expect(diffPluginInventories(local, remote)).toEqual([
      {
        plugin: 'both-different',
        diff: 'version-changed',
        localVersion: '3.0',
        remoteVersion: '2.4',
        localStatus: 'active',
        remoteStatus: 'active'
      },
      {
        plugin: 'both-same',
        diff: 'match',
        localVersion: '2.1',
        remoteVersion: '2.1',
        localStatus: 'active',
        remoteStatus: 'active'
      },
      {
        plugin: 'only-here',
        diff: 'local-only',
        localVersion: '1.0',
        remoteVersion: null,
        localStatus: 'active',
        remoteStatus: null
      },
      {
        plugin: 'only-there',
        diff: 'remote-only',
        localVersion: null,
        remoteVersion: '9.9',
        localStatus: null,
        remoteStatus: 'inactive'
      }
    ])
  })

  it('does not call a plugin changed just because one side has no activation status', () => {
    // ocsites compared status as well, so a directory-scan side ('unknown') made every row differ.
    const scanned = { acf: { name: 'acf', version: '6.2', status: 'unknown' } }
    const viaCli = { acf: { name: 'acf', version: '6.2', status: 'active' } }
    expect(diffPluginInventories(scanned, viaCli)[0].diff).toBe('match')
  })
})

describe('parseWpPluginList', () => {
  it('reads name, version and status', () => {
    expect(parseWpPluginList(remotePluginListJson([['acf', '6.2', 'active']]))).toEqual({
      acf: { name: 'acf', version: '6.2', status: 'active' }
    })
  })

  it.each([['not json'], ['{"name":"acf"}'], ['[{"version":"1"}]']])(
    'survives the malformed payload %s',
    (stdout) => {
      const parsed = parseWpPluginList(stdout)
      expect(parsed === null || Object.keys(parsed).length === 0).toBe(true)
    }
  )
})

describe('comparePlugins', () => {
  it('diffs a WP-CLI remote against a directory-scanned local', async () => {
    seedLocalPlugin('akismet', '5.3')
    seedLocalPlugin('local-only-plugin', '0.1')
    const fake = createFakeSshSession(
      remoteHandler({
        pluginListJson: remotePluginListJson([
          ['akismet', '5.4', 'active'],
          ['remote-only-plugin', '1.2', 'inactive']
        ])
      })
    )

    const comparison = await comparePlugins(createToolConfig(wpDir), fake.session, STANDARD_LAYOUT)

    expect(comparison).toMatchObject({
      environment: 'main',
      localCount: 2,
      remoteCount: 2,
      localSource: 'directory-scan',
      remoteSource: 'wp-cli',
      localOnly: ['local-only-plugin'],
      remoteOnly: ['remote-only-plugin'],
      versionChanged: ['akismet']
    })
    expect(comparison.rows.find((row) => row.plugin === 'akismet')).toMatchObject({
      localVersion: '5.3',
      remoteVersion: '5.4'
    })
  })

  it('falls back to the remote header loop when the server has no WP-CLI', async () => {
    seedLocalPlugin('akismet', '5.3')
    const fake = createFakeSshSession(
      remoteHandler({
        pluginListCode: 127,
        pluginListJson: 'wp: command not found',
        headerLoop: 'akismet|  Version: 5.4\nwordfence| Version: 7.11\n'
      })
    )

    const comparison = await comparePlugins(createToolConfig(wpDir), fake.session, STANDARD_LAYOUT)
    expect(comparison.remoteSource).toBe('directory-scan')
    expect(comparison.remoteCount).toBe(2)
    expect(comparison.versionChanged).toEqual(['akismet'])
    expect(comparison.remoteOnly).toEqual(['wordfence'])
  })

  it('reports an unreadable local plugin directory as unavailable rather than empty truth', async () => {
    const fake = createFakeSshSession(
      remoteHandler({ pluginListJson: remotePluginListJson([['akismet', '5.4', 'active']]) })
    )
    const comparison = await comparePlugins(createToolConfig(wpDir), fake.session, STANDARD_LAYOUT)
    expect(comparison.localSource).toBe('unavailable' satisfies PluginInventory['source'])
    expect(comparison.remoteOnly).toEqual(['akismet'])
  })
})

describe('syncPluginFromRemote', () => {
  function extractsPlugin(slug: string, version: string): void {
    extractMock.mockImplementation(async (_context, _step, _archive, target) => {
      const directory = path.join(target, 'wp-content', 'plugins', slug)
      mkdirSync(directory, { recursive: true })
      writeFileSync(
        path.join(directory, `${slug}.php`),
        `<?php\n/*\nPlugin Name: ${slug}\nVersion: ${version}\n*/\n`
      )
    })
  }

  const download = async (_remote: string, localPath: string): Promise<void> => {
    writeFileSync(localPath, 'PK\u0003\u0004')
  }

  it('resolves an alias to the real remote directory and installs it', async () => {
    seedLocalPlugin('advanced-custom-fields-pro', '6.2.0')
    extractsPlugin('advanced-custom-fields-pro', '6.3.1')
    const fake = createFakeSshSession(
      remoteHandler({ slugs: ['akismet', 'advanced-custom-fields-pro'] }),
      download
    )

    const outcome = await syncPluginFromRemote(
      harness.context,
      createToolConfig(wpDir),
      fake.session,
      STANDARD_LAYOUT,
      { plugin: 'acf', downloadDir, maxZipSizeMb: 512, backup: true, cleanupDownload: true }
    )

    expect(outcome).toMatchObject({
      plugin: 'advanced-custom-fields-pro',
      matchedBy: 'exact',
      previousVersion: '6.2.0',
      newVersion: '6.3.1'
    })
    expect(existsSync(path.join(outcome.target, 'advanced-custom-fields-pro.php'))).toBe(true)
    expect(existsSync(outcome.backupPath ?? '')).toBe(true)
    // cleanupDownload removes both the zip and its extraction.
    expect(existsSync(outcome.target)).toBe(true)
    expect(harness.logs.some((line) => line.includes('6.2.0 → 6.3.1'))).toBe(true)
  })

  it('matches on punctuation-insensitive slugs when there is exactly one candidate', async () => {
    seedLocalPlugin('wp-super-cache', '1.0')
    extractsPlugin('wp-super-cache', '1.9')
    const fake = createFakeSshSession(remoteHandler({ slugs: ['wp-super-cache'] }), download)

    const outcome = await syncPluginFromRemote(
      harness.context,
      createToolConfig(wpDir),
      fake.session,
      STANDARD_LAYOUT,
      {
        plugin: 'wpsupercache',
        downloadDir,
        maxZipSizeMb: 512,
        backup: false,
        cleanupDownload: false
      }
    )
    expect(outcome.matchedBy).toBe('compact')
    expect(outcome.plugin).toBe('wp-super-cache')
  })

  it('refuses an ambiguous request rather than replacing the wrong plugin', async () => {
    seedLocalPlugin('anything', '1.0')
    const fake = createFakeSshSession(
      remoteHandler({ slugs: ['cache-enabler', 'cache-master', 'wp-cache'] }),
      download
    )
    await expect(
      syncPluginFromRemote(
        harness.context,
        createToolConfig(wpDir),
        fake.session,
        STANDARD_LAYOUT,
        {
          plugin: 'cache',
          downloadDir,
          maxZipSizeMb: 512,
          backup: false,
          cleanupDownload: false
        }
      )
    ).rejects.toThrow(/Several remote plugins match/)
  })

  it('reports what is installed when nothing matches', async () => {
    const fake = createFakeSshSession(remoteHandler({ slugs: ['akismet'] }), download)
    await expect(
      syncPluginFromRemote(
        harness.context,
        createToolConfig(wpDir),
        fake.session,
        STANDARD_LAYOUT,
        {
          plugin: 'nope',
          downloadDir,
          maxZipSizeMb: 512,
          backup: false,
          cleanupDownload: false
        }
      )
    ).rejects.toThrow(/Installed: akismet/)
  })

  it.each([['wp-content/plugins/../../etc'], ['a/b'], ['']])(
    'refuses the malformed plugin request %s',
    async (plugin) => {
      const fake = createFakeSshSession(remoteHandler({ slugs: ['akismet'] }), download)
      await expect(
        syncPluginFromRemote(
          harness.context,
          createToolConfig(wpDir),
          fake.session,
          STANDARD_LAYOUT,
          { plugin, downloadDir, maxZipSizeMb: 512, backup: false, cleanupDownload: false }
        )
      ).rejects.toThrow(SiteRunStepError)
    }
  )
})
