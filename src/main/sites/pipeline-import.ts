// The import run: server → local. Ported from ocsites deploy/backup.py::_BackupRunner.run
// (:446-536) with the import toggles only; the deploy half lives in pipeline-deploy.ts.
//
// Every collaborator arrives through SiteImportDependencies. That is not ceremony: it is what lets
// the sequencing rules below — SSH only when a step needs it, cancellation between stages, cleanup
// in a finally — be tested without a server, a database or a WordPress install.

import { rm } from 'node:fs/promises'
import path from 'node:path'
import { extractZipArchive } from './local-archive-extract'
import { importLocalDatabase } from './local-database-import'
import { checkLocalMysqlConnection } from './local-mysql-connection'
import { ensureLocalWpSiteRunning } from './localwp-site-control'
import {
  type RemoteLayout,
  type SiteRunConfig,
  type SiteRunContext,
  SiteRunStepError,
  type SiteSshSession
} from './pipeline-contract'
import {
  dumpAndDownloadRemoteDatabase,
  LOCAL_DUMP_FILENAME,
  type RemoteDatabaseDump
} from './remote-database-dump'
import {
  BASE_ARCHIVE_NAME,
  type PulledSiteArchives,
  pullRemoteFileArchives,
  SITE_TEMP_ARCHIVE_NAMES
} from './remote-file-archive'
import { resolveRemoteLayout } from './remote-wordpress-layout'
import { createSiteSshSession } from './site-ssh-session'
import {
  type MysqlCredentials,
  readLocalWpConfigDbName,
  readRemoteDbCredentials
} from './wp-config-reader'
import { runWpSearchReplace } from './wp-search-replace'
import { applyWpUploadRewrite, cleanUpLocalHtaccess } from './wp-upload-rewrite'

const VALIDATE_STEP = 'validate-remote'
const LOCALWP_STEP = 'ensure-localwp-running'

export type LocalWpRunningOutcome = {
  ok: boolean
  /** Empty when the site is not LocalWP-managed; proceed over TCP. */
  socketPath: string
  message: string
}

export type SiteImportDependencies = {
  ensureLocalWpSiteRunning: (
    sitePath: string,
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
}

export function createDefaultSiteImportDependencies(): SiteImportDependencies {
  return {
    ensureLocalWpSiteRunning,
    checkLocalMysqlConnection,
    createSiteSshSession,
    resolveRemoteLayout,
    readRemoteDbCredentials,
    dumpAndDownloadRemoteDatabase,
    readLocalWpConfigDbName,
    importLocalDatabase,
    pullRemoteFileArchives,
    extractZipArchive,
    applyWpUploadRewrite,
    cleanUpLocalHtaccess,
    runWpSearchReplace
  }
}

export async function runImportPipeline(
  context: SiteRunContext,
  config: SiteRunConfig,
  deps: SiteImportDependencies = createDefaultSiteImportDependencies()
): Promise<void> {
  const { exportDatabase, exportFiles, wpSearchReplace, wpUploadRewrite } = config.environment
  // Rebuilt rather than mutated when LocalWP hands back a fresher socket than the stored one.
  let active = config

  if (exportDatabase || wpSearchReplace || wpUploadRewrite) {
    active = await startLocalStack(context, active, deps)
  }
  if (exportDatabase) {
    // Fail before any SSH work rather than after a multi-GB download.
    context.status('Checking local MySQL connectivity…')
    await deps.checkLocalMysqlConnection(active)
  }

  // Only the server-pull steps need SSH. A local-only run — search-replace plus upload-rewrite
  // after a manual database import — must not demand a remote host be configured at all.
  const needsRemote = exportDatabase || exportFiles
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

      if (exportDatabase) {
        context.throwIfCancelled()
        await importDatabase(context, active, session, deps)
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
      await deps.runWpSearchReplace(context, active)
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
 * Starts a stopped LocalWP site and adopts the socket it reports. Local re-keys the socket
 * directory per site id, so a stored socket goes stale after a Local restart — reusing it is the
 * most common cause of "Can't connect to local MySQL" straight after an import begins.
 */
async function startLocalStack(
  context: SiteRunContext,
  config: SiteRunConfig,
  deps: SiteImportDependencies
): Promise<SiteRunConfig> {
  const outcome = await deps.ensureLocalWpSiteRunning(config.site.path, context.status)
  if (!outcome.ok) {
    throw new SiteRunStepError(LOCALWP_STEP, outcome.message)
  }
  if (!outcome.socketPath || outcome.socketPath === config.site.dbSocket) {
    return config
  }
  context.log(`Using LocalWP MySQL socket ${outcome.socketPath}`)
  return { ...config, site: { ...config.site, dbSocket: outcome.socketPath } }
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
  deps: SiteImportDependencies
): Promise<void> {
  context.status('Extracting database credentials…')
  const credentials = await deps.readRemoteDbCredentials(session, config.environment.rootPath)
  const dump = await deps.dumpAndDownloadRemoteDatabase(context, config, session, credentials)

  // The local wp-config.php is the authority for the local database name — LocalWP always calls it
  // 'local', so importing under the remote name would leave the site pointed at an empty database.
  const localDbName = (await deps.readLocalWpConfigDbName(config.wpDir)) || dump.remoteDbName
  if (localDbName !== dump.remoteDbName) {
    context.log(
      `Remote DB is '${dump.remoteDbName}', importing into local DB '${localDbName}' from wp-config.php.`
    )
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
