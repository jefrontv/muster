// Pull the server's media library down, whole or one subdirectory at a time.
//
// Ported from ocsites `_sync_uploads_from_remote_impl` (mcp_server.py:1823) and
// `_sync_uploads_subdir_from_remote_impl` (:1940). Both are destructive against the local tree, so
// both go through swapLocalTree, which keeps a timestamped copy and rolls back on failure.
//
// The regular import deliberately does NOT bring uploads: backup.py prunes them and the imported
// .htaccess proxies missing media to the live domain instead, because uploads can be tens of GB.
// These tools are the explicit "actually give me the files" escape hatch, which is why they stream
// byte progress and honour cancellation rather than running as a blocking call.
//
// One divergence from ocsites: the content directory is resolved per side instead of hardcoded to
// `wp-content`, so a Bedrock install syncs into `app/uploads` where WordPress will read it.

import { stat } from 'node:fs/promises'
import path from 'node:path'
import { swapLocalTree } from './local-tree-swap'
import {
  SiteRunStepError,
  type RemoteLayout,
  type SiteRunConfig,
  type SiteRunContext,
  type SiteSshSession
} from './pipeline-contract'
import { fetchRemotePaths, resolveLocalContentDirectory } from './remote-path-fetch'

export const UPLOADS_SYNC_STEP = 'uploads-sync'

const UPLOADS_DIR_NAME = 'uploads'
/** Same character class the remote fetch enforces, minus the glob metacharacters. */
const SAFE_SUBDIR = /^[A-Za-z0-9._\-/]+$/

export type UploadsSyncRequest = {
  /** Per-site fetch cache; the zip and its extraction land here. */
  downloadDir: string
  maxZipSizeMb: number
  /** Keep the replaced directory as `<target>.muster-backup-<epoch>`. */
  backup: boolean
  /** Remote `zip` budget; 0 disables it. */
  timeoutMs?: number
  /**
   * Omit to replace the whole media library (`sync_uploads_from_remote`); supply a path below
   * uploads to install just that subtree (`sync_uploads_subdir_from_remote`).
   */
  subdir?: string
}

export type UploadsSyncOutcome = {
  /** Local directory that now holds the server's files. */
  target: string
  backupPath: string | null
  zipSizeBytes: number
  /** Null for a whole-library sync. */
  subdir: string | null
}

/**
 * Accepts '2026', 'uploads/2026' or 'wp-content/uploads/2026/05' and returns the part below
 * uploads. Naming uploads itself is refused, because that is the other tool and silently widening
 * a subdirectory request into "replace the entire media library" is not a recoverable mistake.
 */
export function normalizeUploadsSubdir(value: string): string {
  let subdir = value.trim().replaceAll(/^\/+|\/+$/g, '')
  if (
    subdir === UPLOADS_DIR_NAME ||
    subdir === `wp-content/${UPLOADS_DIR_NAME}` ||
    subdir === `app/${UPLOADS_DIR_NAME}`
  ) {
    throw new SiteRunStepError(
      UPLOADS_SYNC_STEP,
      "Name a subdirectory of uploads, e.g. '2026' — use the whole-library sync for uploads itself."
    )
  }
  for (const prefix of ['wp-content/uploads/', 'app/uploads/', 'uploads/']) {
    if (subdir.startsWith(prefix)) {
      subdir = subdir.slice(prefix.length)
      break
    }
  }
  if (subdir.length === 0) {
    throw new SiteRunStepError(
      UPLOADS_SYNC_STEP,
      "A subdirectory is required, e.g. '2026' or '2026/05'."
    )
  }
  if (subdir.split('/').includes('..') || !SAFE_SUBDIR.test(subdir)) {
    throw new SiteRunStepError(
      UPLOADS_SYNC_STEP,
      `Invalid uploads subdirectory: ${value} — must be relative, with no '..'.`
    )
  }
  return subdir
}

export async function syncUploadsFromRemote(
  context: SiteRunContext,
  config: SiteRunConfig,
  session: SiteSshSession,
  layout: RemoteLayout,
  request: UploadsSyncRequest
): Promise<UploadsSyncOutcome> {
  const subdir = request.subdir === undefined ? null : normalizeUploadsSubdir(request.subdir)
  const localContentDir = await resolveLocalContentDirectory(config.wpDir)
  const localContentPath = path.join(config.wpDir, localContentDir)
  const contentStats = await stat(localContentPath).catch(() => null)
  if (!contentStats?.isDirectory()) {
    throw new SiteRunStepError(
      UPLOADS_SYNC_STEP,
      `No local ${localContentDir} directory at ${localContentPath} — import the site before syncing uploads.`
    )
  }

  const remoteRelative = [layout.contentDir, UPLOADS_DIR_NAME, ...(subdir ? [subdir] : [])].join(
    '/'
  )
  const label = subdir ? `uploads/${subdir}` : 'uploads'
  context.status(`Syncing ${label} from ${config.environmentName}…`)

  const fetched = await fetchRemotePaths(context, session, {
    paths: [remoteRelative],
    archiveRoot: layout.webroot,
    downloadDir: request.downloadDir,
    maxZipSizeMb: request.maxZipSizeMb,
    extract: true,
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
    label
  })
  if (fetched.extractedTo === null) {
    throw new SiteRunStepError(UPLOADS_SYNC_STEP, 'The archive was downloaded but not extracted.')
  }

  // The archive stores remote-relative names, so the payload sits at the remote path inside the
  // extraction — which is not the local path when the two installs use different layouts.
  const source = path.join(fetched.extractedTo, ...remoteRelative.split('/'))
  if (!(await stat(source).catch(() => null))) {
    throw new SiteRunStepError(
      UPLOADS_SYNC_STEP,
      `The downloaded archive did not contain ${remoteRelative}.`
    )
  }

  const target = path.join(localContentPath, UPLOADS_DIR_NAME, ...(subdir ? subdir.split('/') : []))
  context.status(`Installing ${label} into ${target}…`)
  const swapped = await swapLocalTree({ source, target, backup: request.backup })
  context.log(
    swapped.backupPath
      ? `Replaced ${target}; the previous copy is at ${swapped.backupPath}`
      : `Replaced ${target}`
  )
  return {
    target: swapped.target,
    backupPath: swapped.backupPath,
    zipSizeBytes: fetched.zipSizeBytes,
    subdir
  }
}
