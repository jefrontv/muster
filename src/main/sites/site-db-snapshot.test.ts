import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { exportLocalDatabaseMock, importLocalDatabaseMock } = vi.hoisted(() => ({
  exportLocalDatabaseMock: vi.fn(),
  importLocalDatabaseMock: vi.fn()
}))
vi.mock('./localwp-database-export', () => ({
  exportLocalDatabase: exportLocalDatabaseMock
}))
vi.mock('./local-database-import', () => ({
  importLocalDatabase: importLocalDatabaseMock
}))
vi.mock('./wp-config-reader', () => ({
  readLocalWpConfigDbName: vi.fn().mockResolvedValue('local')
}))

import {
  deleteSiteDbSnapshot,
  listSiteDbSnapshots,
  restoreSiteDbSnapshot,
  snapshotSiteDatabase
} from './site-db-snapshot'
import type { SiteRunConfig, SiteRunContext } from './pipeline-contract'

let baseDir = ''
let exportDir = ''

const config = {
  site: { id: 'site-1', dbUser: 'root', dbSocket: '', dbPort: 3306 },
  dbPassword: 'pw',
  wpDir: '/tmp/site'
} as unknown as SiteRunConfig

const context: SiteRunContext = {
  signal: new AbortController().signal,
  log: () => undefined,
  status: () => undefined,
  progress: () => undefined,
  throwIfCancelled: () => undefined
}

beforeEach(async () => {
  baseDir = await mkdtemp(path.join(tmpdir(), 'muster-snap-test-'))
  exportDir = await mkdtemp(path.join(tmpdir(), 'muster-snap-export-'))
  const dumpPath = path.join(exportDir, 'local-db-export.sql.gz')
  await writeFile(dumpPath, 'dump-bytes')
  exportLocalDatabaseMock.mockReset().mockResolvedValue({
    ok: true,
    dumpPath,
    workDirectory: exportDir
  })
  importLocalDatabaseMock.mockReset().mockResolvedValue(undefined)
})

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true })
  await rm(exportDir, { recursive: true, force: true })
})

describe('snapshotSiteDatabase', () => {
  it('stores the dump with metadata and cleans the export directory', async () => {
    const result = await snapshotSiteDatabase({ baseDir, config, reason: 'pre-import' })
    expect(result.ok).toBe(true)
    const listed = await listSiteDbSnapshots(baseDir, 'site-1')
    expect(listed).toHaveLength(1)
    expect(listed[0]?.reason).toBe('pre-import')
    expect(listed[0]?.dbName).toBe('local')
    const stored = await readFile(
      path.join(baseDir, 'site-db-snapshots', 'site-1', `${listed[0]?.id}.sql.gz`),
      'utf8'
    )
    expect(stored).toBe('dump-bytes')
  })

  it('reports export failure without throwing', async () => {
    exportLocalDatabaseMock.mockResolvedValue({
      ok: false,
      databaseMissing: false,
      reason: 'mysqldump was not found'
    })
    const result = await snapshotSiteDatabase({ baseDir, config, reason: 'manual' })
    expect(result).toEqual({ ok: false, reason: 'mysqldump was not found' })
  })
})

describe('restoreSiteDbSnapshot', () => {
  it('feeds the stored dump back through the local import', async () => {
    const created = await snapshotSiteDatabase({ baseDir, config, reason: 'manual' })
    if (!created.ok) {
      throw new Error('setup failed')
    }
    await restoreSiteDbSnapshot({ baseDir, config, snapshotId: created.snapshot.id, context })
    expect(importLocalDatabaseMock).toHaveBeenCalledOnce()
    const [, , dumpPath, dbName] = importLocalDatabaseMock.mock.calls[0]
    expect(String(dumpPath)).toContain(created.snapshot.id)
    expect(dbName).toBe('local')
  })

  it('throws for a missing snapshot', async () => {
    await expect(
      restoreSiteDbSnapshot({ baseDir, config, snapshotId: 'nope', context })
    ).rejects.toThrow()
  })
})

describe('listSiteDbSnapshots', () => {
  it('survives a torn meta file', async () => {
    const dir = path.join(baseDir, 'site-db-snapshots', 'site-1')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'broken.json'), '{not json')
    await expect(listSiteDbSnapshots(baseDir, 'site-1')).resolves.toEqual([])
  })
})

describe('deleteSiteDbSnapshot', () => {
  it('removes dump and metadata', async () => {
    const created = await snapshotSiteDatabase({ baseDir, config, reason: 'manual' })
    if (!created.ok) {
      throw new Error('setup failed')
    }
    await deleteSiteDbSnapshot(baseDir, 'site-1', created.snapshot.id)
    await expect(listSiteDbSnapshots(baseDir, 'site-1')).resolves.toEqual([])
  })
})
