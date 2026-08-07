// IPC surface for site import/deploy runs.
//
// Follows src/main/ipc/ephemeral-vm.ts: a removeHandler prologue so a re-register cannot double
// up, tagged-union results instead of exceptions (a throw across the bridge loses its type and
// its stack), and sender.send for the streaming half, guarded against a destroyed renderer.

import { join } from 'node:path'
import { app, ipcMain, type WebContents } from 'electron'
import type {
  SiteActiveRun,
  SiteRun,
  SiteRunEvent,
  SiteRunLogPage
} from '../../shared/site-run-types'
import type { SiteResult } from '../../shared/site-types'
import type { SiteWpCliResult } from '../../shared/site-wp-cli-actions'
import { executeSiteWpCliAction } from '../sites/site-wp-cli-exec'
import type { Store } from '../persistence'
import { pruneSiteRuns, SITE_RUNS_DIR_NAME } from '../sites/site-run-log'
import { createSiteRunJob } from '../sites/site-run-dispatch'
import { createSiteRunService, type SiteRunService } from '../sites/site-run-service'
import { buildSiteSummary } from '../sites/site-summary'
import { isSiteEnvironmentName } from './sites-payload-validation'
import { failure, requireSite } from './sites-result'

const SITE_RUN_CHANNELS = [
  'siteRuns:start',
  'siteRuns:cancel',
  'siteRuns:list',
  'siteRuns:readLog',
  'siteRuns:active',
  'siteRuns:wpCli'
] as const

const EVENT_CHANNEL = 'siteRuns:event'
const DEFAULT_LOG_LINES = 500
const MAX_LOG_LINES = 5_000
const DEFAULT_RUN_LIST_LIMIT = 20

type StartArgs = {
  siteId: string
  group: 'import' | 'deploy'
  environment?: string
  runId?: string
}

function isStartArgs(value: unknown): value is StartArgs {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const args = value as Record<string, unknown>
  return (
    typeof args.siteId === 'string' &&
    (args.group === 'import' || args.group === 'deploy') &&
    (args.environment === undefined || isSiteEnvironmentName(args.environment)) &&
    (args.runId === undefined || typeof args.runId === 'string')
  )
}

let service: SiteRunService | null = null
/** Set by registerSiteRunHandlers; keeps the subscriber set private to that closure. */
let addSubscriber: ((sender: WebContents) => void) | null = null

/**
 * The job factory is injectable so the IPC seam can be exercised against a scripted job. In
 * production it is always createSiteRunJob, which binds the real import/deploy pipelines.
 */
export type SiteRunJobFactory = typeof createSiteRunJob

export function registerSiteRunHandlers(
  store: Store,
  createJob: SiteRunJobFactory = createSiteRunJob
): void {
  for (const channel of SITE_RUN_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  // Every renderer that has touched the surface gets the stream, so a second window and a
  // remounted panel both keep receiving without the run knowing who is listening.
  const subscribers = new Set<WebContents>()
  const baseDir = join(app.getPath('userData'), SITE_RUNS_DIR_NAME)
  const runs = createSiteRunService({
    baseDir,
    emit: (event: SiteRunEvent) => {
      for (const sender of subscribers) {
        if (sender.isDestroyed()) {
          subscribers.delete(sender)
          continue
        }
        sender.send(EVENT_CHANNEL, event)
      }
    }
  })
  service = runs
  addSubscriber = (sender) => subscribers.add(sender)
  // Fail-open GC for the 30-day / 200-per-site retention, once per registration.
  try {
    pruneSiteRuns(baseDir)
  } catch {
    // A read-only userData directory must not block the sites surface.
  }

  ipcMain.handle('siteRuns:start', async (event, args: unknown): Promise<SiteResult<SiteRun>> => {
    try {
      if (!isStartArgs(args)) {
        return { ok: false, error: 'Invalid run request.' }
      }
      subscribers.add(event.sender)
      const site = requireSite(store, args.siteId)
      const summary = await buildSiteSummary(site)
      const environment = args.environment ?? summary.resolvedEnvironment.environment
      if (!environment) {
        return { ok: false, error: `Site has no environment to target: ${site.displayName}` }
      }
      return {
        ok: true,
        value: runs.start({
          ...(args.runId ? { runId: args.runId } : {}),
          siteId: site.id,
          siteName: site.displayName,
          group: args.group,
          environment,
          branch: summary.branch,
          job: createJob(site, environment, args.group)
        })
      }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle('siteRuns:cancel', (_event, runId: unknown): SiteResult<boolean> => {
    if (typeof runId !== 'string') {
      return { ok: false, error: 'Invalid run id.' }
    }
    return { ok: true, value: runs.cancel(runId) }
  })

  ipcMain.handle('siteRuns:list', (event, args: unknown): SiteResult<SiteRun[]> => {
    const { siteId, limit } = (args ?? {}) as { siteId?: unknown; limit?: unknown }
    if (typeof siteId !== 'string') {
      return { ok: false, error: 'Invalid site id.' }
    }
    subscribers.add(event.sender)
    const requested = typeof limit === 'number' ? limit : DEFAULT_RUN_LIST_LIMIT
    return { ok: true, value: runs.listForSite(siteId, requested) }
  })

  ipcMain.handle('siteRuns:readLog', (_event, args: unknown): SiteResult<SiteRunLogPage> => {
    const { siteId, runId, maxLines } = (args ?? {}) as {
      siteId?: unknown
      runId?: unknown
      maxLines?: unknown
    }
    if (typeof siteId !== 'string' || typeof runId !== 'string') {
      return { ok: false, error: 'Invalid log request.' }
    }
    const requested = typeof maxLines === 'number' ? maxLines : DEFAULT_LOG_LINES
    return { ok: true, value: runs.readLog(siteId, runId, Math.min(requested, MAX_LOG_LINES)) }
  })

  // WP-CLI quick actions: a whitelisted command run inline over SSH, result returned directly —
  // no run record, because a ten-second read has no life beyond the panel that asked for it.
  ipcMain.handle(
    'siteRuns:wpCli',
    async (_event, args: unknown): Promise<SiteResult<SiteWpCliResult>> => {
      try {
        const { siteId, actionId, environment, confirmed } = (args ?? {}) as {
          siteId?: unknown
          actionId?: unknown
          environment?: unknown
          confirmed?: unknown
        }
        if (typeof siteId !== 'string' || typeof actionId !== 'string') {
          return { ok: false, error: 'Invalid WP-CLI request.' }
        }
        if (environment !== undefined && !isSiteEnvironmentName(environment)) {
          return { ok: false, error: 'Invalid environment.' }
        }
        const site = requireSite(store, siteId)
        return {
          ok: true,
          value: await executeSiteWpCliAction({
            site,
            actionId,
            ...(typeof environment === 'string' ? { environment } : {}),
            confirmed: confirmed === true
          })
        }
      } catch (error) {
        return failure(error)
      }
    }
  )

  // The catch-up call: a remounted panel reads live runs plus their last progress from main.
  ipcMain.handle('siteRuns:active', (event): SiteResult<SiteActiveRun[]> => {
    subscribers.add(event.sender)
    return {
      ok: true,
      value: runs.listActive().map((run) => ({ run, progress: runs.getProgress(run.id) }))
    }
  })
}

/** Abort every in-flight run — called on app quit so no ssh or mysqldump outlives the window. */
export function cancelAllSiteRuns(): void {
  service?.cancelAll()
}

/**
 * The shared run registry, or null before registerSiteRunHandlers has run. Never cache the
 * result: a re-register replaces the service, and a stale one emits into a dead subscriber set.
 */
export function getSiteRunService(): SiteRunService | null {
  return service
}

/**
 * Adds a renderer to the siteRuns:event stream. A caller that starts a run through
 * getSiteRunService() rather than siteRuns:start MUST call this with its own event.sender,
 * otherwise the run it started streams to nobody.
 */
export function subscribeSiteRunEvents(sender: WebContents): void {
  addSubscriber?.(sender)
}
