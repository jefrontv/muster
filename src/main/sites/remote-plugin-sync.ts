// Pull one plugin directory down from the server, and diff the two plugin sets.
//
// Ported from ocsites `_sync_plugin_from_remote_impl` (mcp_server.py:2259) and
// `_compare_plugins_impl` (:1450). Both live here because they answer the same operational
// question — "what does the server have that I do not, and can I have it?" — and share the slug
// resolution, layout handling and inventory reads.
//
// The sync is destructive against a local plugin directory, so it goes through swapLocalTree: the
// previous copy is kept as `<slug>.muster-backup-<epoch>` and restored if the move fails.

import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import type { PluginComparison } from '../../shared/site-tool-types'
import { swapLocalTree } from './local-tree-swap'
import {
  diffPluginInventories,
  readLocalPluginInventory,
  readRemotePluginInventory
} from './plugin-inventory'
import {
  SiteRunStepError,
  type RemoteLayout,
  type SiteRunConfig,
  type SiteRunContext,
  type SiteSshSession
} from './pipeline-contract'
import { fetchRemotePaths, resolveLocalContentDirectory } from './remote-path-fetch'
import {
  PLUGIN_SYNC_STEP,
  readLocalPluginHeader,
  resolveRemotePluginSlug,
  type RemotePluginMatch
} from './remote-plugin-slug'
import type { LocalWpEnvResolver } from './wp-cli-runner'

export async function comparePlugins(
  config: SiteRunConfig,
  session: SiteSshSession,
  layout: RemoteLayout,
  resolveLocalWpEnv?: LocalWpEnvResolver
): Promise<PluginComparison> {
  const localContentDir = await resolveLocalContentDirectory(config.wpDir)
  const [local, remote] = await Promise.all([
    readLocalPluginInventory(
      config.wpDir,
      localContentDir,
      config.site.dbSocket,
      resolveLocalWpEnv
    ),
    readRemotePluginInventory(session, layout, config.environmentName)
  ])
  const rows = diffPluginInventories(local.plugins, remote.plugins)
  return {
    environment: config.environmentName,
    localCount: Object.keys(local.plugins).length,
    remoteCount: Object.keys(remote.plugins).length,
    localSource: local.source,
    remoteSource: remote.source,
    rows,
    localOnly: rows.filter((row) => row.diff === 'local-only').map((row) => row.plugin),
    remoteOnly: rows.filter((row) => row.diff === 'remote-only').map((row) => row.plugin),
    versionChanged: rows.filter((row) => row.diff === 'version-changed').map((row) => row.plugin)
  }
}

export type PluginSyncRequest = {
  /** What the caller asked for; resolved against the server's real directory listing. */
  plugin: string
  downloadDir: string
  maxZipSizeMb: number
  backup: boolean
  /** Delete the zip and its extraction afterwards. A plugin is small; the cache is not useful. */
  cleanupDownload: boolean
  timeoutMs?: number
}

export type PluginSyncOutcome = {
  plugin: string
  matchedBy: RemotePluginMatch['matchedBy']
  target: string
  backupPath: string | null
  /** Null when the plugin was not installed locally, or had no readable header. */
  previousVersion: string | null
  newVersion: string | null
  zipSizeBytes: number
}

export async function syncPluginFromRemote(
  context: SiteRunContext,
  config: SiteRunConfig,
  session: SiteSshSession,
  layout: RemoteLayout,
  request: PluginSyncRequest
): Promise<PluginSyncOutcome> {
  const match = await resolveRemotePluginSlug(session, layout, request.plugin, request.timeoutMs)
  context.status(`Syncing plugin ${match.slug} from ${config.environmentName}…`)
  if (match.matchedBy !== 'exact') {
    context.log(`Resolved "${request.plugin}" to ${match.slug} (${match.matchedBy} match)`)
  }

  const localContentDir = await resolveLocalContentDirectory(config.wpDir)
  const localPlugins = path.join(config.wpDir, localContentDir, 'plugins')
  if (!(await stat(localPlugins).catch(() => null))?.isDirectory()) {
    throw new SiteRunStepError(
      PLUGIN_SYNC_STEP,
      `No local plugins directory at ${localPlugins} — import the site before syncing a plugin.`
    )
  }
  const target = path.join(localPlugins, match.slug)
  const previous = await readLocalPluginHeader(target)

  const fetched = await fetchRemotePaths(context, session, {
    paths: [match.remotePath],
    archiveRoot: layout.webroot,
    downloadDir: request.downloadDir,
    maxZipSizeMb: request.maxZipSizeMb,
    extract: true,
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
    label: `plugin ${match.slug}`
  })
  if (fetched.extractedTo === null) {
    throw new SiteRunStepError(PLUGIN_SYNC_STEP, 'The archive was downloaded but not extracted.')
  }
  const source = path.join(fetched.extractedTo, ...match.remotePath.split('/'))
  if (!(await stat(source).catch(() => null))?.isDirectory()) {
    throw new SiteRunStepError(
      PLUGIN_SYNC_STEP,
      `The downloaded archive did not contain ${match.remotePath}.`
    )
  }
  // Read the incoming header before the move: afterwards the source directory is gone.
  const incoming = await readLocalPluginHeader(source)

  context.status(`Installing ${match.slug} into ${target}…`)
  const swapped = await swapLocalTree({ source, target, backup: request.backup })
  context.log(
    [
      `${match.slug}: ${previous?.version ?? 'not installed'} → ${incoming?.version ?? 'unknown'}`,
      swapped.backupPath ? `previous copy at ${swapped.backupPath}` : null
    ]
      .filter(Boolean)
      .join('; ')
  )

  if (request.cleanupDownload) {
    await Promise.all([
      rm(fetched.localZipPath, { force: true }).catch(() => undefined),
      rm(fetched.extractedTo, { recursive: true, force: true }).catch(() => undefined)
    ])
  }

  return {
    plugin: match.slug,
    matchedBy: match.matchedBy,
    target: swapped.target,
    backupPath: swapped.backupPath,
    previousVersion: previous?.version ?? null,
    newVersion: incoming?.version ?? null,
    zipSizeBytes: fetched.zipSizeBytes
  }
}
