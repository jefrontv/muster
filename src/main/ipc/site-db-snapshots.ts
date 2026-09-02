// IPC surface for local-database snapshots: list what the pre-import safety net has captured,
// restore one, delete one. Restore runs inline (an import of a local gz dump is seconds to a
// couple of minutes) and returns the log it produced instead of streaming.

import { app, ipcMain } from 'electron'
import type { SiteResult } from '../../shared/site-types'
import type { Store } from '../persistence'
import { buildSiteRunConfig } from '../sites/site-run-config'
import {
  deleteSiteDbSnapshot,
  listSiteDbSnapshots,
  restoreSiteDbSnapshot,
  snapshotSiteDatabase,
  type SiteDbSnapshot
} from '../sites/site-db-snapshot'
import type { SiteRunContext } from '../sites/pipeline-contract'
import { failure, requireSite } from './sites-result'

const CHANNELS = [
  'siteDbSnapshots:list',
  'siteDbSnapshots:create',
  'siteDbSnapshots:restore',
  'siteDbSnapshots:delete'
] as const

function collectorContext(lines: string[]): SiteRunContext {
  const controller = new AbortController()
  return {
    signal: controller.signal,
    log: (line) => lines.push(line),
    status: (stage) => lines.push(stage),
    progress: () => undefined,
    throwIfCancelled: () => undefined
  }
}

/** The site's run-target environment name, needed only to key the db secret lookup. */
function resolveEnvironmentName(store: Store, siteId: string): string {
  const site = requireSite(store, siteId)
  const names = Object.keys(site.environments)
  const active =
    site.activeEnvironment && site.environments[site.activeEnvironment]
      ? site.activeEnvironment
      : names[0]
  if (!active) {
    throw new Error('This site has no environment; add one before using database snapshots.')
  }
  return active
}

export function registerSiteDbSnapshotHandlers(store: Store): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }
  const baseDir = app.getPath('userData')

  ipcMain.handle(
    'siteDbSnapshots:list',
    async (_event, siteId: unknown): Promise<SiteResult<SiteDbSnapshot[]>> => {
      try {
        if (typeof siteId !== 'string') {
          return { ok: false, error: 'Invalid site id.' }
        }
        requireSite(store, siteId)
        return { ok: true, value: await listSiteDbSnapshots(baseDir, siteId) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'siteDbSnapshots:create',
    async (_event, siteId: unknown): Promise<SiteResult<SiteDbSnapshot>> => {
      try {
        if (typeof siteId !== 'string') {
          return { ok: false, error: 'Invalid site id.' }
        }
        const site = requireSite(store, siteId)
        const config = await buildSiteRunConfig(
          site,
          resolveEnvironmentName(store, siteId),
          'import'
        )
        const result = await snapshotSiteDatabase({ baseDir, config, reason: 'manual' })
        return result.ok
          ? { ok: true, value: result.snapshot }
          : { ok: false, error: result.reason }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'siteDbSnapshots:restore',
    async (_event, args: unknown): Promise<SiteResult<{ log: string[] }>> => {
      try {
        const { siteId, snapshotId } = (args ?? {}) as { siteId?: unknown; snapshotId?: unknown }
        if (typeof siteId !== 'string' || typeof snapshotId !== 'string') {
          return { ok: false, error: 'Invalid restore request.' }
        }
        const site = requireSite(store, siteId)
        const config = await buildSiteRunConfig(
          site,
          resolveEnvironmentName(store, siteId),
          'import'
        )
        const log: string[] = []
        await restoreSiteDbSnapshot({
          baseDir,
          config,
          snapshotId,
          context: collectorContext(log)
        })
        return { ok: true, value: { log } }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'siteDbSnapshots:delete',
    async (_event, args: unknown): Promise<SiteResult<boolean>> => {
      try {
        const { siteId, snapshotId } = (args ?? {}) as { siteId?: unknown; snapshotId?: unknown }
        if (typeof siteId !== 'string' || typeof snapshotId !== 'string') {
          return { ok: false, error: 'Invalid delete request.' }
        }
        requireSite(store, siteId)
        await deleteSiteDbSnapshot(baseDir, siteId, snapshotId)
        return { ok: true, value: true }
      } catch (error) {
        return failure(error)
      }
    }
  )
}
