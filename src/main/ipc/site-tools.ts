// IPC surface for the site utility tools (ocsites phase-10 parity).
//
// Split by lifetime, not by topic. The four channels here move files and can run for an hour on a
// media-heavy site, so each starts a job on the shared run service: progress, log persistence,
// cancellation and the remount catch-up then come from `siteRuns:*` for free, and a uploads pull
// shows up in the run history next to the import that preceded it. The fast read tools live in
// site-tools-diagnostics.ts and answer inline.
//
// Every channel here writes to the local checkout, so every one passes assertSiteToolAllowed — the
// same buildSiteToolPlan/canStartRun gate an import or deploy goes through.

import { join } from 'node:path'
import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { SiteRun } from '../../shared/site-run-types'
import type { SiteResult } from '../../shared/site-types'
import type { Store } from '../persistence'
import type { RemoteSiteTool } from '../sites/site-tool-session'
import type { SiteRunConfig, SiteRunContext } from '../sites/pipeline-contract'
import { fetchRemotePaths } from '../sites/remote-path-fetch'
import { syncPluginFromRemote } from '../sites/remote-plugin-sync'
import { syncUploadsFromRemote } from '../sites/remote-uploads-sync'
import { buildSiteRunConfig } from '../sites/site-run-config'
import type { SiteToolStep } from '../sites/site-run-plan'
import { withRemoteSiteTool } from '../sites/site-tool-session'
import {
  registerSiteToolDiagnosticHandlers,
  SITE_TOOL_DIAGNOSTIC_CHANNELS
} from './site-tools-diagnostics'
import {
  readEnvironment,
  readFlag,
  readPositiveInteger,
  readToolArgs,
  requireRemotePaths,
  requireSiteId,
  requireText,
  type SiteToolArgs
} from './site-tools-payload'
import { assertSiteToolAllowed, resolveSiteToolTarget } from './site-tools-target'
import { failure } from './sites-result'
import { getSiteRunService, subscribeSiteRunEvents } from './site-runs'

export const SITE_DOWNLOADS_DIR_NAME = 'site-downloads'

const SITE_TOOL_SYNC_CHANNELS = [
  'siteTools:syncUploads',
  'siteTools:syncUploadsSubdir',
  'siteTools:syncPlugin',
  'siteTools:fetchPaths'
] as const

/** Ceiling on the caller's size cap; the fetch primitive enforces its own hard 4096 MB limit. */
const MAX_ZIP_SIZE_MB = 4096
const MAX_REMOTE_TIMEOUT_MS = 3_600_000

export function registerSiteToolHandlers(store: Store): void {
  for (const channel of [...SITE_TOOL_SYNC_CHANNELS, ...SITE_TOOL_DIAGNOSTIC_CHANNELS]) {
    ipcMain.removeHandler(channel)
  }
  registerSiteToolDiagnosticHandlers(store)

  ipcMain.handle('siteTools:syncUploads', (event, raw: unknown) =>
    startUploadsSync(store, event, raw, null)
  )
  ipcMain.handle('siteTools:syncUploadsSubdir', (event, raw: unknown) =>
    startUploadsSync(store, event, raw, 'required')
  )

  ipcMain.handle(
    'siteTools:syncPlugin',
    async (event, raw: unknown): Promise<SiteResult<SiteRun>> => {
      try {
        const args = readToolArgs(raw)
        const plugin = requireText(args, 'plugin')
        const options = readSyncOptions(args, 512)
        const cleanupDownload = readFlag(args, 'cleanupDownload', true)
        return await startToolRun({
          store,
          event,
          args,
          step: { key: 'sync-plugin', label: `Sync plugin ${plugin}`, remote: true },
          work: (context, config, tool, downloadDir) =>
            syncPluginFromRemote(context, config, tool.session, tool.layout, {
              plugin,
              downloadDir,
              cleanupDownload,
              ...options
            }).then(() => undefined)
        })
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'siteTools:fetchPaths',
    async (event, raw: unknown): Promise<SiteResult<SiteRun>> => {
      try {
        const args = readToolArgs(raw)
        const paths = requireRemotePaths(args)
        const options = readSyncOptions(args, 50)
        const extract = readFlag(args, 'extract', false)
        return await startToolRun({
          store,
          event,
          args,
          step: { key: 'fetch-paths', label: `Fetch ${paths.length} remote path(s)`, remote: true },
          work: async (context, _config, tool, downloadDir) => {
            const fetched = await fetchRemotePaths(context, tool.session, {
              paths,
              archiveRoot: tool.layout.webroot,
              downloadDir,
              maxZipSizeMb: options.maxZipSizeMb,
              extract,
              ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
              label: paths.join(', ')
            })
            context.log(`Downloaded ${fetched.localZipPath}`)
            if (fetched.extractedTo) {
              context.log(`Extracted to ${fetched.extractedTo}`)
            }
            if (fetched.missing.length > 0) {
              context.log(`Not on the server: ${fetched.missing.join(', ')}`)
            }
          }
        })
      } catch (error) {
        return failure(error)
      }
    }
  )
}

async function startUploadsSync(
  store: Store,
  event: IpcMainInvokeEvent,
  raw: unknown,
  subdirMode: 'required' | null
): Promise<SiteResult<SiteRun>> {
  try {
    const args = readToolArgs(raw)
    const subdir = subdirMode === 'required' ? requireText(args, 'subdir') : undefined
    const options = readSyncOptions(args, 1024)
    const label = subdir ? `Sync uploads/${subdir}` : 'Sync uploads'
    return await startToolRun({
      store,
      event,
      args,
      step: { key: 'sync-uploads', label, remote: true },
      work: (context, config, tool, downloadDir) =>
        syncUploadsFromRemote(context, config, tool.session, tool.layout, {
          downloadDir,
          ...(subdir === undefined ? {} : { subdir }),
          ...options
        }).then(() => undefined)
    })
  } catch (error) {
    return failure(error)
  }
}

type SyncOptions = {
  maxZipSizeMb: number
  backup: boolean
  timeoutMs?: number
}

function readSyncOptions(args: SiteToolArgs, defaultZipSizeMb: number): SyncOptions {
  const timeoutMs = readPositiveInteger(args, 'timeoutMs', 0, MAX_REMOTE_TIMEOUT_MS)
  return {
    maxZipSizeMb: readPositiveInteger(args, 'maxZipSizeMb', defaultZipSizeMb, MAX_ZIP_SIZE_MB),
    // Default on: replacing a local tree without a copy of the old one is not recoverable.
    backup: readFlag(args, 'backup', true),
    ...(timeoutMs > 0 ? { timeoutMs } : {})
  }
}

type ToolRunRequest = {
  store: Store
  event: IpcMainInvokeEvent
  args: SiteToolArgs
  step: SiteToolStep
  work: (
    context: SiteRunContext,
    config: SiteRunConfig,
    tool: RemoteSiteTool,
    downloadDir: string
  ) => Promise<void>
}

async function startToolRun(request: ToolRunRequest): Promise<SiteResult<SiteRun>> {
  const { store, args, step } = request
  const requestedEnvironment = readEnvironment(args)
  const target = await resolveSiteToolTarget(
    store,
    requireSiteId(args),
    requestedEnvironment,
    'import'
  )
  assertSiteToolAllowed({
    target,
    group: 'import',
    step,
    requestedEnvironment,
    confirmed: readFlag(args, 'confirm', false)
  })
  const runs = getSiteRunService()
  if (!runs) {
    return { ok: false, error: 'The site run service is not available yet.' }
  }
  // Without this the run would stream to nobody: the subscriber set only grows when a renderer
  // touches a siteRuns channel, and this renderer came in through siteTools.
  subscribeSiteRunEvents(request.event.sender)
  const downloadDir = join(
    app.getPath('userData'),
    SITE_DOWNLOADS_DIR_NAME,
    target.site.id.replaceAll(/[^A-Za-z0-9._-]+/g, '-')
  )
  const { site, environment } = target
  return {
    ok: true,
    value: runs.start({
      siteId: site.id,
      siteName: site.displayName,
      group: 'import',
      environment,
      branch: target.summary.branch,
      job: async (context) => {
        // Rebuilt inside the job so a secret rotated between queueing and starting is picked up,
        // matching createSiteRunJob.
        const config = buildSiteRunConfig(site, environment, 'import')
        context.status(`${step.label} from ${environment}`)
        await withRemoteSiteTool(config, context.signal, (tool) =>
          request.work(context, config, tool, downloadDir)
        )
      }
    })
  }
}
