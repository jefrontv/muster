// Binds the MCP tool seam to the real Muster engine.
//
// Everything here is a one-line delegation on purpose: the tools must not grow a second copy of
// summary building, env resolution, run planning or log reading. This is also the only module in
// the MCP directory that pulls in Electron-dependent code, which is what keeps the tool tests free
// of the app.

import type { Site, SiteCustomStep } from '../../../shared/site-types'
import { applyEnvironmentPatches } from '../site-environment-patches'
import { createSiteRunJob } from '../site-run-dispatch'
import { listSiteRuns, readSiteRunLog } from '../site-run-log'
import { createSiteRunService } from '../site-run-service'
import {
  copySiteEnvironmentSecrets,
  deleteSiteEnvironmentSecrets,
  hasSiteSecret
} from '../site-secret-store'
import { buildSiteSummaries, buildSiteSummary } from '../site-summary'
import { createSiteSshSession } from '../site-ssh-session'
import { acfStateDir, createAcfStateStore } from '../wp-acf-state-store'
import type { SiteMcpContext, SiteMcpStore } from './site-mcp-context'
import { readSiteGitStatus } from './site-mcp-git-status'
import { writeSiteToDataFile, writeStepLibraryToDataFile } from './site-mcp-disk-write'
import {
  changeSecretsThroughBridge,
  setStepLibraryThroughBridge,
  updateSiteThroughBridge,
  type SiteWriteBridgeBody
} from './site-mcp-store-bridge'
import {
  collectPlanAnnotationThroughBridge,
  openPlanAnnotationThroughBridge,
  PlanBridgeUnavailableError
} from './site-mcp-plan-bridge'

export type SiteMcpEngineOptions = {
  store: SiteMcpStore
  /** <userData>/site-runs — shared with the app, so run history is visible from both. */
  runsBaseDir: string
  cwd?: string
  /**
   * Discovery file for the running GUI's write bridge. Absent (tests, or a host
   * with no userData) means writes go straight to this process's store.
   */
  bridgeFile?: string
  /**
   * The profile data file. With no GUI running, writes patch just the changed slice of it; this
   * process's startup Store would save its whole snapshot over whatever changed since.
   */
  dataFile?: string
}

/**
 * The bridge file, or a failure that explains itself.
 *
 * Why not degrade: both plan-review calls need the GUI. Opening a review without a window would
 * report a review nobody can see, and collecting one would poll an id that was never issued.
 */
function requireBridgeFile(bridgeFile: string | undefined): string {
  if (!bridgeFile) {
    throw new PlanBridgeUnavailableError(
      'No Muster window is running, so there is nobody to review the plan.'
    )
  }
  return bridgeFile
}

export function createSiteMcpContext(options: SiteMcpEngineOptions): SiteMcpContext {
  const { store } = options
  const runs = createSiteRunService({
    baseDir: options.runsBaseDir,
    // No renderer is attached to an MCP-hosted run. Progress still reaches the caller through the
    // persisted log, which get_job_status reads, so dropping the event stream loses nothing.
    emit: () => {}
  })

  const applyBody =
    (body: SiteWriteBridgeBody) =>
    (current: Site): Site => ({
      ...current,
      ...body.updates,
      ...(body.environmentPatches
        ? { environments: applyEnvironmentPatches(current.environments, body.environmentPatches) }
        : {}),
      id: current.id
    })
  const writeSiteLocally = (body: SiteWriteBridgeBody): Site | null => {
    if (options.dataFile) {
      return writeSiteToDataFile(options.dataFile, body.siteId, applyBody(body))
    }
    const current = store.getSite(body.siteId)
    if (!current) {
      return null
    }
    const { id: _id, ...rest } = applyBody(body)(current)
    return store.updateSite(body.siteId, rest)
  }
  const writeLibraryLocally = (steps: readonly SiteCustomStep[]): void => {
    if (options.dataFile) {
      writeStepLibraryToDataFile(options.dataFile, steps)
      return
    }
    store.setSiteStepLibrary?.(steps)
  }
  // Only the GUI can decrypt stored passwords; this process tries its own copy only with no GUI.
  const changeSecrets = async (
    siteId: string,
    change: { copy?: { from: string; to: string }; remove?: string }
  ): Promise<void> => {
    if (
      options.bridgeFile &&
      (await changeSecretsThroughBridge({ bridgeFile: options.bridgeFile, siteId, ...change }))
    ) {
      return
    }
    if (change.copy) {
      copySiteEnvironmentSecrets(siteId, change.copy.from, change.copy.to)
    }
    if (change.remove) {
      deleteSiteEnvironmentSecrets(siteId, change.remove)
    }
  }

  return {
    cwd: options.cwd ?? process.cwd(),
    store,
    updateSite: (siteId, updates, environmentPatches) => {
      const body = { siteId, updates, ...(environmentPatches ? { environmentPatches } : {}) }
      return options.bridgeFile
        ? updateSiteThroughBridge({ ...body, bridgeFile: options.bridgeFile }, writeSiteLocally)
        : Promise.resolve(writeSiteLocally(body))
    },
    annotatePlan: (request) =>
      openPlanAnnotationThroughBridge({
        // Why throw when absent rather than degrade: a plan review needs a person, and this process
        // has no window. Failing here says so; falling back would silently return no feedback.
        bridgeFile: requireBridgeFile(options.bridgeFile),
        request
      }),
    collectPlanReview: (args) =>
      collectPlanAnnotationThroughBridge({
        bridgeFile: requireBridgeFile(options.bridgeFile),
        reviewId: args.reviewId,
        waitMs: args.waitMs
      }),
    // Reads come from the store (the refreshing wrapper re-parses the file); writes take the same
    // bridge-first path as a site write, for the same clobbering reason.
    getStepLibrary: () => store.getSiteStepLibrary?.() ?? [],
    setStepLibrary: async (steps) => {
      if (!store.setSiteStepLibrary && !options.dataFile) {
        return
      }
      if (options.bridgeFile) {
        await setStepLibraryThroughBridge(
          { steps, bridgeFile: options.bridgeFile },
          writeLibraryLocally
        )
        return
      }
      writeLibraryLocally(steps)
    },
    acfState: createAcfStateStore(acfStateDir(options.runsBaseDir)),
    summarize: buildSiteSummary,
    summarizeAll: buildSiteSummaries,
    hasSshSecret: (siteId, environment) => hasSiteSecret(siteId, environment, 'ssh'),
    copyEnvironmentSecrets: (siteId, from, to) => changeSecrets(siteId, { copy: { from, to } }),
    deleteEnvironmentSecrets: (siteId, environment) =>
      changeSecrets(siteId, { remove: environment }),
    gitStatus: readSiteGitStatus,
    listRuns: (siteId, limit) => listSiteRuns(options.runsBaseDir, siteId, limit),
    readRunLog: (siteId, runId, maxLines) =>
      readSiteRunLog(options.runsBaseDir, siteId, runId, maxLines),
    listActiveRuns: () =>
      runs.listActive().map((run) => ({ run, progress: runs.getProgress(run.id) })),
    startRun: (request) => {
      const site: Site | null = store.getSite(request.siteId)
      if (!site) {
        throw new Error(`Unknown site: ${request.siteId}`)
      }
      return runs.start({
        ...request,
        job: createSiteRunJob(site, request.environment, request.group)
      })
    },
    openSshSession: createSiteSshSession,
    cancelRun: (runId) => runs.cancel(runId),
    shutdownRuns: async () => {
      // Snapshot the ids first: cancelAll() starts tearing the registry down as jobs settle.
      const ids = runs.listActive().map((run) => run.id)
      runs.cancelAll()
      await Promise.all(ids.map((id) => runs.waitFor(id)))
    }
  }
}
