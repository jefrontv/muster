import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SiteSshSession } from './pipeline-contract'
import { importArchiveTrees } from './remote-file-archive'
import {
  buildLargeEntryScanCommand,
  parseLargeEntryScan,
  scanLargeImportEntries
} from './remote-large-file-scan'

const LAYOUT = { webroot: '/srv/site', contentDir: 'wp-content' }

describe('importArchiveTrees', () => {
  it('splits skip rules between the base and content trees', () => {
    const trees = importArchiveTrees(LAYOUT, ['backups', 'wp-content/ai1wm-backups'])
    expect(trees.base.pruneDirs).toContain('backups')
    expect(trees.base.pruneDirs).not.toContain('wp-content/ai1wm-backups')
    expect(trees.content.pruneDirs).toContain('ai1wm-backups')
    expect(trees.content.prefix).toBe('wp-content/')
  })
})

describe('parseLargeEntryScan', () => {
  it('reads files and folders in webroot terms and ignores noise', () => {
    expect(
      parseLargeEntryScan(
        'F\t204800\tai1wm-backups/site.wpress\nD\t614400\tai1wm-backups\njunk\n',
        'wp-content/'
      )
    ).toEqual([
      { path: 'wp-content/ai1wm-backups/site.wpress', kind: 'file', bytes: 204800 * 1024 },
      { path: 'wp-content/ai1wm-backups', kind: 'folder', bytes: 614400 * 1024 }
    ])
  })
})

describe('the scan command under a real shell', () => {
  let root = ''
  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('flags big files and folders, and never counts pruned or excluded paths', () => {
    root = mkdtempSync(path.join(tmpdir(), 'muster-scan-'))
    const write = (relative: string, kb: number): void => {
      mkdirSync(path.dirname(path.join(root, relative)), { recursive: true })
      // Real bytes: du counts blocks, so a sparse file would read as empty.
      writeFileSync(path.join(root, relative), Buffer.alloc(kb * 1024, 1))
    }
    write('backups/huge.tar', 64)
    write('backups/notes.txt', 1)
    write('uploads/photo.jpg', 64)
    write('skipped/also.bin', 64)
    write('dump.zip', 64)
    write('index.php', 1)

    const command = buildLargeEntryScanCommand(
      { workDir: root, prefix: '', pruneDirs: ['uploads', 'skipped'], excludeGlobs: ['*.zip'] },
      { fileBytes: 32 * 1024, folderBytes: 48 * 1024 }
    )
    const stdout = execFileSync('sh', ['-c', command], { encoding: 'utf8' })
    const paths = parseLargeEntryScan(stdout, '')
      .map((entry) => `${entry.kind}:${entry.path}`)
      .sort()
    expect(paths).toEqual(['file:backups/huge.tar', 'folder:backups'])
  })
})

describe('scanLargeImportEntries', () => {
  it('lists folders first with their big files under them, minus kept paths', async () => {
    const outputs = [
      'F\t300000\tbackups/a.tar\nD\t700000\tbackups\nF\t200000\tbig.log\n',
      'F\t250000\tkept/movie.mp4\n'
    ]
    const session = {
      exec: async () => ({ code: 0, stdout: outputs.shift() ?? '', stderr: '' })
    } as unknown as SiteSshSession
    const entries = await scanLargeImportEntries(session, LAYOUT, [
      { path: 'wp-content/kept', action: 'keep' }
    ])
    expect(entries.map((entry) => entry.path)).toEqual(['backups', 'backups/a.tar', 'big.log'])
  })

  it('throws when the check itself fails, so the import can go ahead without it', async () => {
    const session = {
      exec: async () => ({ code: 127, stdout: '', stderr: 'awk: not found' })
    } as unknown as SiteSshSession
    await expect(scanLargeImportEntries(session, LAYOUT, [])).rejects.toThrow('awk: not found')
  })
})
