// The import run: server → local. Ported from ocsites deploy/backup.py::_BackupRunner.run
// (:446-536) with the import toggles only; the deploy half lives in pipeline-deploy.ts.
//
// Every collaborator arrives through SiteImportDependencies. That is not ceremony: it is what lets
// the sequencing rules below — SSH only when a step needs it, cancellation between stages, cleanup
// in a finally — be tested without a server, a database or a WordPress install.

import { rm } from 'node:fs/promises'
import path from 'node:path'
import type { Site } from '../../shared/site-types'
import { customStepsNeedRemote, runCustomSteps } from './custom-steps'
import { startLocalStack, type LocalStackRunningOutcome } from './pipeline-local-stack-start'
import {
  type RemoteLayout,
  type SiteRunConfig,
  type SiteRunContext,
  SiteRunStepError,
  type SiteSshSession
} from './pipeline-contract'
import { LOCAL_DUMP_FILENAME, type RemoteDatabaseDump } from './remote-database-dump'
import {
  BASE_ARCHIVE_NAME,
  type PulledSiteArchives,
  SITE_TEMP_ARCHIVE_NAMES
} from './remote-file-archive'
import type { MysqlCredentials } from './wp-config-reader'
import type { AgentLocalRoutes } from './agent-local-import-steps'
import { createDefaultSiteImportDependencies } from './pipeline-import-defaults'

const VALIDATE_STEP = 'validate-remote'

/** Kept as the module's own name for the outcome the local-stack step reports. */
export type LocalWpRunningOutcome = LocalStackRunningOutcome

export type SiteImportDependencies = {
  ensureLocalSiteRunning: (
    site: Pick<Site, 'path' | 'localStack'>,
    onStatus?: (message: string) => void
  ) => Promise<LocalWpRunningOutcome>
  checkLocalMysqlConnection: (config: SiteRunConfig) => Promise<void>
  createSiteSshSession: (config: SiteRunConfig, signal: AbortSignal) => Promise<SiteSshSession>
  resolveRemoteLayout: (session: SiteSshSession, rootPath: string) => Promise<RemoteLayout>
  readRemoteDbCredentials: (session: SiteSshSession, rootPath: string) => Promise<MysqlCredentials>
  dumpAndDownloadRemoteDatabase: (
    context: SiteRunContext,
    config: SiteRunConfig,
    session: SiteSshSession,
    credentials: MysqlCredentials
  ) => Promise<RemoteDatabaseDump>
  readLocalWpConfigDbName: (wpDir: string) => Promise<string>
  importLocalDatabase: (
    context: SiteRunContext,
    config: SiteRunConfig,
    dumpPath: string,
    dbName: string
  ) => Promise<void>
  /** Pre-import safety net; reports failure instead of throwing so a missing mysqldump cannot block imports. */
  snapshotLocalDatabase: (
    context: SiteRunContext,
    config: SiteRunConfig
  ) => Promise<{ ok: boolean; reason?: string }>
  pullRemoteFileArchives: (
    context: SiteRunContext,
    config: SiteRunConfig,
    session: SiteSshSession,
    layout: RemoteLayout
  ) => Promise<PulledSiteArchives>
  extractZipArchive: (
    context: SiteRunContext,
    step: string,
    archivePath: string,
    targetDirectory: string
  ) => Promise<void>
  applyWpUploadRewrite: (context: SiteRunContext, config: SiteRunConfig) => Promise<void>
  cleanUpLocalHtaccess: (context: SiteRunContext, config: SiteRunConfig) => Promise<void>
  runWpSearchReplace: (context: SiteRunContext, config: SiteRunConfig) => Promise<void>
  /**
   * The agent-local branch: decided once per run, then the daemon loads the dump, rewrites the
   * domain and checks the site. `slug: null` keeps every step on the code above.
   */
  decideAgentLocalRoutes: (config: SiteRunConfig) => Promise<AgentLocalRoutes>
  importDatabaseViaAgentLocal: (
    context: SiteRunContext,
    slug: string,
    dumpPath: string
  ) => Promise<void>
  rewriteDomainViaAgentLocal: (
    context: SiteRunContext,
    config: SiteRunConfig,
    slug: string
  ) => Promise<void>
  verifySiteViaAgentLocal: (context: SiteRunContext, slug: string) => Promise<void>
  /** Overridden only by tests. */
  runCustomSteps?: typeof runCustomSteps
}

export async function runImportPipeline(
  context: SiteRunContext,
  config: SiteRunConfig,
  deps: SiteImportDependencies = createDefaultSiteImportDependencies()
): Promise<void> {
  const { exportDatabase, exportFiles, wpSearchReplace, wpUploadRewrite } = config.environment
  // Rebuilt rather than mutated when LocalWP hands back a fresher socket than the stored one.
  let active = config

  // Which code path the database steps take. Decided once the stack is up so the daemon can answer,
  // and logged when it says no, so a LocalWP-style run on an agent-local site is never a mystery.
  let routes: AgentLocalRoutes = { slug: null, reason: 'no database step in this run' }
  if (exportDatabase || wpSearchReplace || wpUploadRewrite) {
    active = await startLocalStack(context, active, deps.ensureLocalSiteRunning)
    routes = await deps.decideAgentLocalRoutes(active)
    if (routes.slug === null && active.site.localStack === 'agent-local') {
      context.log(`Using Muster's own database tools: ${routes.reason}.`)
    }
  }
  if (exportDatabase && routes.slug === null) {
    // Fail before any SSH work rather than after a multi-GB download. The daemon route needs no
    // local client, so it has nothing to check here.
    context.status('Checking local MySQL connectivity…')
    await deps.checkLocalMysqlConnection(active)
  }

  // Only the server-pull steps need SSH. A local-only run — search-replace plus upload-rewrite
  // after a manual database import — must not demand a remote host be configured at all.
  const customSteps = deps.runCustomSteps ?? runCustomSteps
  const needsRemote = exportDatabase || exportFiles || customStepsNeedRemote(config, 'import')
  let session: SiteSshSession | null = null
  let layout: RemoteLayout | null = null
  try {
    if (needsRemote) {
      assertRemoteConfigured(active)
      context.status('Connecting to server…')
      session = await deps.createSiteSshSession(active, context.signal)
      // Resolves the real webroot (Bedrock serves from web/) and rejects a non-WordPress target.
      layout = await deps.resolveRemoteLayout(session, active.environment.rootPath)
      context.log(`Remote webroot ${layout.webroot}, content directory ${layout.contentDir}`)
    }

    // Why here: `before` means before every built-in step of the group, but after the session
    // exists — a remote `before` step (maintenance mode on) needs it.
    await customSteps(context, active, 'import', 'before', session)

    if (session !== null && layout !== null) {
      if (exportDatabase) {
        context.throwIfCancelled()
        await importDatabase(context, active, session, deps, routes.slug)
      }
      if (exportFiles) {
        context.throwIfCancelled()
        await importFiles(context, active, session, layout, deps)
      }
    }

    if (wpUploadRewrite) {
      context.throwIfCancelled()
      await deps.applyWpUploadRewrite(context, active)
      await deps.cleanUpLocalHtaccess(context, active)
    }
    if (wpSearchReplace) {
      context.throwIfCancelled()
      await (routes.slug !== null
        ? deps.rewriteDomainViaAgentLocal(context, active, routes.slug)
        : deps.runWpSearchReplace(context, active))
    }

    await customSteps(context, active, 'import', 'after', session)
    // The verdict the run used to skip: only the daemon can ask the site, so only its branch does.
    if (routes.slug !== null && (exportDatabase || wpSearchReplace)) {
      context.throwIfCancelled()
      await deps.verifySiteViaAgentLocal(context, routes.slug)
    }
    context.status('Operations completed successfully!')
  } finally {
    await removeTempArtifacts(active, layout, session)
    if (session !== null) {
      try {
        await session.close()
      } catch {
        // A close failure must never replace the error that actually ended the run.
      }
    }
  }
}

/**
 * An empty hostname makes the SSH layer fall back to localhost, surfacing an opaque
 * "cannot connect to port 22 on 127.0.0.1" instead of a message pointing at the real fix.
 */
function assertRemoteConfigured(config: SiteRunConfig): void {
  const name = config.site.displayName || config.site.path
  if (!config.environment.hostname.trim()) {
    throw new SiteRunStepError(
      VALIDATE_STEP,
      `No remote SSH host configured for '${name}'. Set the server hostname and SSH username on the '${config.environmentName}' environment before running an import.`
    )
  }
  if (!config.environment.username.trim()) {
    throw new SiteRunStepError(
      VALIDATE_STEP,
      `No SSH username configured for '${name}'. Set the SSH username on the '${config.environmentName}' environment before running an import.`
    )
  }
}

async function importDatabase(
  context: SiteRunContext,
  config: SiteRunConfig,
  session: SiteSshSession,
  deps: SiteImportDependencies,
  agentLocalSlug: string | null
): Promise<void> {
  context.status('Extracting database credentials…')
  const credentials = await deps.readRemoteDbCredentials(session, config.environment.rootPath)
  const dump = await deps.dumpAndDownloadRemoteDatabase(context, config, session, credentials)

  // The daemon owns naming, snapshotting and loading for its own sites; nothing below applies.
  if (agentLocalSlug !== null) {
    context.throwIfCancelled()
    await deps.importDatabaseViaAgentLocal(context, agentLocalSlug, dump.localDumpPath)
    return
  }

  // Where the local database name comes from, in order of authority:
  //
  // 1. The stack, when it owns the naming. agent-local grants its per-site user rights on `al_<slug>`
  //    and nothing else, so importing under any other name fails on privilege rather than landing
  //    somewhere odd — and wp-config.php may still hold the name from the source site.
  // 2. The local wp-config.php — LocalWP always calls it 'local', so importing under the remote
  //    name would leave the site pointed at an empty database.
  // 3. The remote name, when the site has no local wp-config.php yet.
  const stackDbName = config.localDatabaseName?.trim() ?? ''
  const localDbName =
    stackDbName || (await deps.readLocalWpConfigDbName(config.wpDir)) || dump.remoteDbName
  if (localDbName !== dump.remoteDbName) {
    const source = stackDbName ? `the ${config.site.localStack} stack` : 'wp-config.php'
    context.log(
      `Remote DB is '${dump.remoteDbName}', importing into local DB '${localDbName}' from ${source}.`
    )
  }

  // The point of no return is the local import below — snapshot the database it will overwrite.
  context.throwIfCancelled()
  context.status('Snapshotting local database…')
  const snapshot = await deps.snapshotLocalDatabase(context, config)
  if (!snapshot.ok) {
    context.log(`Warning: pre-import snapshot skipped — ${snapshot.reason ?? 'unknown reason'}`)
  }

  context.throwIfCancelled()
  await deps.importLocalDatabase(context, config, dump.localDumpPath, localDbName)
  context.status('Database imported')
}

async function importFiles(
  context: SiteRunContext,
  config: SiteRunConfig,
  session: SiteSshSession,
  layout: RemoteLayout,
  deps: SiteImportDependencies
): Promise<void> {
  const archives = await deps.pullRemoteFileArchives(context, config, session, layout)

  context.throwIfCancelled()
  context.status(`Extracting ${path.basename(archives.baseArchivePath)}…`)
  await deps.extractZipArchive(
    context,
    'extract-base-archive',
    archives.baseArchivePath,
    config.wpDir
  )
  // Dropped as soon as it is extracted: the two archives together can be several GB.
  await rm(archives.baseArchivePath, { force: true })

  context.throwIfCancelled()
  context.status(`Extracting ${path.basename(archives.contentArchivePath)}…`)
  await deps.extractZipArchive(
    context,
    'extract-content-archive',
    archives.contentArchivePath,
    path.join(config.wpDir, archives.contentDirectoryName)
  )
  await rm(archives.contentArchivePath, { force: true })
}

/**
 * Removes the dump and the zips whatever the outcome. The success path already deletes them; a
 * failed or cancelled run would otherwise orphan multi-hundred-MB files in the working tree and in
 * the customer's webroot. Best-effort throughout — this runs inside a finally.
 */
async function removeTempArtifacts(
  config: SiteRunConfig,
  layout: RemoteLayout | null,
  session: SiteSshSession | null
): Promise<void> {
  for (const name of [LOCAL_DUMP_FILENAME, ...SITE_TEMP_ARCHIVE_NAMES]) {
    try {
      await rm(path.join(config.wpDir, name), { force: true })
    } catch {
      // A locked or read-only leftover is not worth failing a finished run over.
    }
  }
  if (session === null) {
    return
  }
  const rootPath = config.environment.rootPath
  // Fall back to the configured root when the layout was never resolved, so a connection that
  // failed mid-handshake still cleans up whatever an earlier attempt left behind.
  const webroot = layout?.webroot ?? rootPath
  const contentDir = layout?.contentDir ?? 'wp-content'
  for (const remotePath of [
    `${rootPath}/${LOCAL_DUMP_FILENAME}`,
    `${webroot}/${BASE_ARCHIVE_NAME}`,
    `${webroot}/${contentDir}/${contentDir}.zip`
  ]) {
    await session.removeRemoteFile(remotePath)
  }
}
