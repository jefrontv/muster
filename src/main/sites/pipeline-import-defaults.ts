// The real implementations behind SiteImportDependencies. Kept apart from the pipeline so the
// pipeline file stays about ordering, and so tests never import a module that pulls in SSH, mysql
// and the agent-local client just to construct a fake.

import { getCanonicalUserDataPath } from '../persistence'
import {
  decideAgentLocalRoutes,
  importDatabaseViaAgentLocal,
  rewriteDomainViaAgentLocal,
  verifySiteViaAgentLocal
} from './agent-local-import-steps'
import { extractZipArchive } from './local-archive-extract'
import { importLocalDatabase } from './local-database-import'
import { checkLocalMysqlConnection } from './local-mysql-connection'
import type { SiteImportDependencies } from './pipeline-import'
import { ensureLocalSiteRunning } from './pipeline-local-stack-start'
import { dumpAndDownloadRemoteDatabase } from './remote-database-dump'
import { pullRemoteFileArchives } from './remote-file-archive'
import { resolveRemoteLayout } from './remote-wordpress-layout'
import { snapshotSiteDatabase } from './site-db-snapshot'
import { createSiteSshSession } from './site-ssh-session'
import { readLocalWpConfigDbName, readRemoteDbCredentials } from './wp-config-reader'
import { runWpSearchReplace } from './wp-search-replace'
import { applyWpUploadRewrite, cleanUpLocalHtaccess } from './wp-upload-rewrite'

export function createDefaultSiteImportDependencies(): SiteImportDependencies {
  return {
    ensureLocalSiteRunning,
    checkLocalMysqlConnection,
    createSiteSshSession,
    resolveRemoteLayout,
    readRemoteDbCredentials,
    dumpAndDownloadRemoteDatabase,
    readLocalWpConfigDbName,
    importLocalDatabase,
    snapshotLocalDatabase: (context, config) =>
      snapshotSiteDatabase({
        // Why not app.getPath: the muster-sites MCP server runs this pipeline under
        // ELECTRON_RUN_AS_NODE, where `app` is undefined — the snapshot step died with
        // "Cannot read properties of undefined (reading 'getPath')" right before the import
        // overwrote the local database. The canonical path resolves in both runtimes and keeps
        // MCP snapshots in the directory the GUI's snapshot list reads.
        baseDir: getCanonicalUserDataPath(),
        config,
        reason: 'pre-import',
        onStatus: (message) => context.log(message),
        signal: context.signal
      }),
    pullRemoteFileArchives,
    extractZipArchive,
    applyWpUploadRewrite,
    cleanUpLocalHtaccess,
    runWpSearchReplace,
    decideAgentLocalRoutes,
    importDatabaseViaAgentLocal,
    rewriteDomainViaAgentLocal,
    verifySiteViaAgentLocal
  }
}
