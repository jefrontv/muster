// Local-database snapshots: a gzipped dump of the site's CURRENT local DB, taken automatically
// before an import overwrites it, restorable with one click. The dump reuses the ocsites-ported
// exportLocalDatabase (0600 option file, pipefail, redacted stderr); this module owns where the
// dumps live, the retention cap, and the restore path.

import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SiteDbSnapshot } from '../../shared/site-db-snapshot-types'
import { importLocalDatabase } from './local-database-import'
import { exportLocalDatabase } from './localwp-database-export'
import type { SiteRunConfig, SiteRunContext } from './pipeline-contract'
import { readLocalWpConfigDbName } from './wp-config-reader'

export const SITE_DB_SNAPSHOTS_DIR_NAME = 'site-db-snapshots'

/** Per-site retention. Site DBs run hundreds of MB gzipped; five covers "the last few imports". */
const MAX_SNAPSHOTS_PER_SITE = 5

export type { SiteDbSnapshot }

export type SiteDbSnapshotResult =
  | { ok: true; snapshot: SiteDbSnapshot }
  | { ok: false; reason: string }

function snapshotDir(baseDir: string, siteId: string): string {
  return path.join(baseDir, SITE_DB_SNAPSHOTS_DIR_NAME, siteId)
}

function dumpPathFor(baseDir: string, siteId: string, id: string): string {
  return path.join(snapshotDir(baseDir, siteId), `${id}.sql.gz`)
}

function metaPathFor(baseDir: string, siteId: string, id: string): string {
  return path.join(snapshotDir(baseDir, siteId), `${id}.json`)
}

/**
 * Which schema to dump.
 *
 * The stack that started this run is the authority when it names one — agent-local owns
 * `al_<slug>` and hands it over with the live credentials. Only then fall back to reading
 * wp-config.php, and only then to LocalWP's `local`, which is a guess that silently dumped the
 * wrong (or a non-existent) database for every other stack.
 */
async function resolveLocalDbName(config: SiteRunConfig): Promise<string> {
  const named = config.localDatabaseName?.trim() ?? ''
  if (named) {
    return named
  }
  return (await readLocalWpConfigDbName(config.wpDir).catch(() => '')) || 'local'
}

/**
 * Dump the site's current local database into the snapshot store. Failure is reported, never
 * thrown: a machine without mysqldump must not lose the ability to import, only the safety net —
 * the caller decides how loudly to say so.
 */
export async function snapshotSiteDatabase(args: {
  baseDir: string
  config: SiteRunConfig
  reason: SiteDbSnapshot['reason']
  onStatus?: (message: string) => void
  signal?: AbortSignal
}): Promise<SiteDbSnapshotResult> {
  const { baseDir, config } = args
  const dbName = await resolveLocalDbName(config)
  const exported = await exportLocalDatabase({
    databaseName: dbName,
    databaseUser: config.site.dbUser,
    databasePassword: config.dbPassword,
    // Socket or port, never neither: a TCP stack on a non-default port is unreachable without it.
    ...(config.site.dbSocket.trim()
      ? { databaseSocket: config.site.dbSocket }
      : { databasePort: config.site.dbPort }),
    ...(args.onStatus ? { onStatus: args.onStatus } : {}),
    ...(args.signal ? { signal: args.signal } : {})
  })
  if (!exported.ok) {
    return { ok: false, reason: exported.reason }
  }

  const id = new Date().toISOString().replaceAll(':', '-').replace(/\..*$/, 'Z')
  const directory = snapshotDir(baseDir, config.site.id)
  try {
    await mkdir(directory, { recursive: true })
    const target = dumpPathFor(baseDir, config.site.id, id)
    await copyFile(exported.dumpPath, target)
    const sizeBytes = (await stat(target)).size
    const snapshot: SiteDbSnapshot = {
      id,
      siteId: config.site.id,
      dbName,
      takenAt: Date.now(),
      sizeBytes,
      reason: args.reason
    }
    await writeFile(metaPathFor(baseDir, config.site.id, id), JSON.stringify(snapshot))
    await pruneSiteDbSnapshots(baseDir, config.site.id)
    return { ok: true, snapshot }
  } catch (error) {
    return {
      ok: false,
      reason: `Could not store the snapshot: ${error instanceof Error ? error.message : String(error)}`
    }
  } finally {
    // The temp export directory is ours to clean whatever happened above.
    await rm(exported.workDirectory, { recursive: true, force: true })
  }
}

export async function listSiteDbSnapshots(
  baseDir: string,
  siteId: string
): Promise<SiteDbSnapshot[]> {
  const directory = snapshotDir(baseDir, siteId)
  const entries = await readdir(directory).catch(() => [] as string[])
  const snapshots: SiteDbSnapshot[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) {
      continue
    }
    try {
      const parsed = JSON.parse(await readFile(path.join(directory, entry), 'utf8'))
      if (parsed && typeof parsed.id === 'string' && typeof parsed.takenAt === 'number') {
        snapshots.push(parsed as SiteDbSnapshot)
      }
    } catch {
      // A torn meta file hides one snapshot; it must not hide the list.
    }
  }
  return snapshots.sort((a, b) => b.takenAt - a.takenAt)
}

/** Restores a snapshot into the site's local database. Throws SiteRunStepError on failure. */
export async function restoreSiteDbSnapshot(args: {
  baseDir: string
  config: SiteRunConfig
  snapshotId: string
  context: SiteRunContext
}): Promise<void> {
  const { baseDir, config, snapshotId, context } = args
  const dumpPath = dumpPathFor(baseDir, config.site.id, snapshotId)
  await stat(dumpPath)
  const dbName = await resolveLocalDbName(config)
  context.status(`Restoring local database '${dbName}' from snapshot ${snapshotId}…`)
  await importLocalDatabase(context, config, dumpPath, dbName)
  context.status('Snapshot restored')
}

export async function deleteSiteDbSnapshot(
  baseDir: string,
  siteId: string,
  snapshotId: string
): Promise<void> {
  await rm(dumpPathFor(baseDir, siteId, snapshotId), { force: true })
  await rm(metaPathFor(baseDir, siteId, snapshotId), { force: true })
}

async function pruneSiteDbSnapshots(baseDir: string, siteId: string): Promise<void> {
  const snapshots = await listSiteDbSnapshots(baseDir, siteId)
  for (const stale of snapshots.slice(MAX_SNAPSHOTS_PER_SITE)) {
    await deleteSiteDbSnapshot(baseDir, siteId, stale.id)
  }
}
