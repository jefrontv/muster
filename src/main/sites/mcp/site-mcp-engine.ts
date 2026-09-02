// Binds the MCP tool seam to the real Muster engine.
//
// Everything here is a one-line delegation on purpose: the tools must not grow a second copy of
// summary building, env resolution, run planning or log reading. This is also the only module in
// the MCP directory that pulls in Electron-dependent code, which is what keeps the tool tests free
// of the app.

import type { Site } from '../../../shared/site-types'
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
import type { SiteMcpContext, SiteMcpStore } from './site-mcp-context'
import { readSiteGitStatus } from './site-mcp-git-status'
import { setStepLibraryThroughBridge, updateSiteThroughBridge } from './site-mcp-store-bridge'
import {
  PlanBridgeUnavailableError,
  requestPlanAnnotationThroughBridge
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
}

export function createSiteMcpContext(options: SiteMcpEngineOptions): SiteMcpContext {
  const { store } = options
  const runs = createSiteRunService({
    baseDir: options.runsBaseDir,
    // No renderer is attached to an MCP-hosted run. Progress still reaches the caller through the
    // persisted log, which get_job_status reads, so dropping the event stream loses nothing.
    emit: () => {}
  })

  return {
    cwd: options.cwd ?? process.cwd(),
    store,
    updateSite: (siteId, updates) =>
      options.bridgeFile
        ? updateSiteThroughBridge(store, {
            siteId,
            updates,
            bridgeFile: options.bridgeFile
          })
        : Promise.resolve(store.updateSite(siteId, updates)),
    annotatePlan: (request) =>
      requestPlanAnnotationThroughBridge({
        // Why throw when absent rather than degrade: a plan review needs a person, and this process
        // has no window. Failing here says so; falling back would silently return no feedback.
        bridgeFile:
          options.bridgeFile ??
          (() => {
            throw new PlanBridgeUnavailableError(
              'No Muster window is running, so there is nobody to review the plan.'
            )
          })(),
        request
      }),
    // Reads come from the store (the refreshing wrapper re-parses the file); writes take the same
    // bridge-first path as a site write, for the same clobbering reason.
    getStepLibrary: () => store.getSiteStepLibrary?.() ?? [],
    setStepLibrary: async (steps) => {
      const write = store.setSiteStepLibrary
      if (!write) {
        return
      }
      if (options.bridgeFile) {
        await setStepLibraryThroughBridge(
          { setSiteStepLibrary: write },
          {
            steps,
            bridgeFile: options.bridgeFile
          }
        )
        return
      }
      write(steps)
    },
    summarize: buildSiteSummary,
    summarizeAll: buildSiteSummaries,
    hasSshSecret: (siteId, environment) => hasSiteSecret(siteId, environment, 'ssh'),
    copyEnvironmentSecrets: copySiteEnvironmentSecrets,
    deleteEnvironmentSecrets: deleteSiteEnvironmentSecrets,
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
