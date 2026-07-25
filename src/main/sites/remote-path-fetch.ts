// Bundle remote paths into one zip on the server, download it with byte progress, and extract it
// locally. Ported from ocsites `_fetch_remote_paths_impl` (mcp_server.py:1580-1821).
//
// This is the primitive under uploads sync and plugin sync: build remote → size-gate → SFTP down →
// safe extract. The size gate runs BEFORE the download on purpose, because the whole point is that
// a caller who asks for `uploads` on a media-heavy site is told to narrow the request rather than
// spending an hour pulling 40 GB.
//
// Electron-free by contract: the download directory is supplied, not derived from app paths.

import { randomUUID } from 'node:crypto'
import { mkdir, readdir, rm, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { extractZipArchive } from './local-archive-extract'
import {
  quoteShellArgument,
  SiteRunStepError,
  type SiteRunContext,
  type SiteSshSession
} from './pipeline-contract'

export const REMOTE_FETCH_STEP = 'remote-fetch'

export const REMOTE_FETCH_MAX_PATHS = 100
/** Hard ceiling on the requested cap, matching ocsites. */
export const REMOTE_FETCH_MAX_ZIP_MB = 4096

const BYTES_PER_MB = 1024 * 1024
const PROBE_TIMEOUT_MS = 15_000
const STAT_TIMEOUT_MS = 15_000
const DEFAULT_ZIP_TIMEOUT_MS = 900_000

/** Keeps a zip's own name safe for the remote shell and for a local filename. */
const SAFE_REMOTE_PATH = /^[A-Za-z0-9._\-*?[\]/]+$/

/** Old downloads are pruned to this many newest zips per site, dropping anything past the age. */
const KEEP_DOWNLOAD_ZIPS = 20
const DOWNLOAD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type RemotePathFetchRequest = {
  /** Relative to `archiveRoot`, or absolute (archived from `/`). Never contains '..'. */
  paths: readonly string[]
  /** Remote directory relative paths resolve against — the resolved webroot, not `rootPath`. */
  archiveRoot: string
  /** Local directory the zip and its extraction land in. Created if absent. */
  downloadDir: string
  maxZipSizeMb: number
  /** Extract next to the zip and report where. Required by every sync built on this. */
  extract: boolean
  /** Remote `zip` budget. 0 disables it. */
  timeoutMs?: number
  /** Names the transfer in the progress label, e.g. 'uploads'. */
  label: string
}

export type RemotePathFetchResult = {
  localZipPath: string
  /** Null when `extract` was false. */
  extractedTo: string | null
  zipSizeBytes: number
  requested: string[]
  /** Paths that existed on the server and made it into the archive. */
  fetched: string[]
  /** Resolved remote locations of `fetched`, in the same order. */
  resolvedFetched: string[]
  missing: string[]
}

/** Throws SiteRunStepError with the ocsites wording for anything the shell must never see. */
export function assertFetchablePaths(paths: readonly string[]): void {
  if (paths.length === 0) {
    throw new SiteRunStepError(
      REMOTE_FETCH_STEP,
      "No paths requested. For media, ask for 'uploads'."
    )
  }
  if (paths.length > REMOTE_FETCH_MAX_PATHS) {
    throw new SiteRunStepError(
      REMOTE_FETCH_STEP,
      `Too many paths (${paths.length} > ${REMOTE_FETCH_MAX_PATHS} per call).`
    )
  }
  for (const entry of paths) {
    const trimmed = entry.trim()
    if (trimmed.length === 0 || !SAFE_REMOTE_PATH.test(trimmed)) {
      throw new SiteRunStepError(
        REMOTE_FETCH_STEP,
        `Path contains disallowed characters: ${entry} — only A-Z 0-9 . _ - * ? [ ] / are permitted.`
      )
    }
    if (trimmed.split('/').includes('..')) {
      throw new SiteRunStepError(
        REMOTE_FETCH_STEP,
        `Path traversal ('..') is not allowed: ${entry}`
      )
    }
  }
}

type FetchItem = { requested: string; full: string; archiveArg: string; absolute: boolean }

export async function fetchRemotePaths(
  context: SiteRunContext,
  session: SiteSshSession,
  request: RemotePathFetchRequest
): Promise<RemotePathFetchResult> {
  assertFetchablePaths(request.paths)
  const root = request.archiveRoot.replace(/\/+$/, '') || '.'
  const maxBytes =
    Math.min(Math.max(request.maxZipSizeMb, 1), REMOTE_FETCH_MAX_ZIP_MB) * BYTES_PER_MB
  await mkdir(request.downloadDir, { recursive: true })
  const stamp = Date.now()
  const localZipPath = path.join(request.downloadDir, `${stamp}-fetch.zip`)
  const remoteZip = `/tmp/muster-fetch-${stamp}-${randomUUID().slice(0, 8)}.zip`

  context.status(`Locating ${request.label} on the server…`)
  const items: FetchItem[] = []
  const missing: string[] = []
  for (const entry of request.paths) {
    context.throwIfCancelled()
    const requested = entry.trim()
    const absolute = requested.startsWith('/')
    const full = absolute ? requested : `${root}/${requested}`
    const probe = await session.exec(`test -e ${quoteShellArgument(full)}`, {
      timeoutMs: PROBE_TIMEOUT_MS
    })
    if (probe.code === 0) {
      items.push({
        requested,
        full,
        archiveArg: absolute ? requested.slice(1) : requested,
        absolute
      })
    } else {
      missing.push(requested)
    }
  }
  if (items.length === 0) {
    throw new SiteRunStepError(
      REMOTE_FETCH_STEP,
      `None of the requested paths exist under ${root}: ${missing.join(', ')}`
    )
  }

  try {
    const remoteSize = await buildRemoteZip(context, session, request, items, root, remoteZip)
    if (remoteSize > maxBytes) {
      throw new SiteRunStepError(
        REMOTE_FETCH_STEP,
        `The remote archive is ${formatMb(remoteSize)} MB, over the ${formatMb(maxBytes)} MB cap. ` +
          'Narrow the request or raise the size cap (ceiling ' +
          `${REMOTE_FETCH_MAX_ZIP_MB} MB).`
      )
    }
    context.status(`Downloading ${request.label} (${formatMb(remoteSize)} MB)…`)
    await session.download(remoteZip, localZipPath, (transferred, total) => {
      context.progress({ label: `Downloading ${request.label}`, transferred, total })
    })
  } finally {
    // The temp archive goes away even on failure or cancel — otherwise a broken fetch leaves a
    // multi-GB file in the customer's /tmp.
    await session.removeRemoteFile(remoteZip)
  }

  const zipSizeBytes = (await stat(localZipPath)).size
  let extractedTo: string | null = null
  if (request.extract) {
    extractedTo = path.join(request.downloadDir, `${stamp}-fetch`)
    context.status(`Extracting ${request.label}…`)
    await extractZipArchive(context, REMOTE_FETCH_STEP, localZipPath, extractedTo)
  }
  await pruneDownloads(request.downloadDir)

  return {
    localZipPath,
    extractedTo,
    zipSizeBytes,
    requested: [...request.paths],
    fetched: items.map((item) => item.requested),
    resolvedFetched: items.map((item) => item.full),
    missing
  }
}

/** Returns the remote archive size in bytes. */
async function buildRemoteZip(
  context: SiteRunContext,
  session: SiteSshSession,
  request: RemotePathFetchRequest,
  items: readonly FetchItem[],
  root: string,
  remoteZip: string
): Promise<number> {
  context.status(`Archiving ${request.label} on the server…`)
  // Relative entries are zipped from the webroot and absolute ones from '/', so the archive keeps
  // portable relative names and extracts into the matching local tree.
  for (const [cwd, group] of [
    [root, items.filter((item) => !item.absolute)],
    ['/', items.filter((item) => item.absolute)]
  ] as const) {
    if (group.length === 0) {
      continue
    }
    context.throwIfCancelled()
    const args = group.map((item) => quoteShellArgument(item.archiveArg)).join(' ')
    const result = await session.exec(
      `cd ${quoteShellArgument(cwd)} && zip -qr --symlinks ${quoteShellArgument(remoteZip)} ${args}`,
      { timeoutMs: request.timeoutMs ?? DEFAULT_ZIP_TIMEOUT_MS }
    )
    if (result.code !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim() || `zip exited ${result.code}`
      throw new SiteRunStepError(REMOTE_FETCH_STEP, `Remote zip failed in ${cwd}: ${detail}`)
    }
  }
  // GNU stat, BSD stat, then wc -c: shared hosts run all three shapes.
  const sized = await session.exec(
    `stat -c %s ${quoteShellArgument(remoteZip)} 2>/dev/null || ` +
      `stat -f %z ${quoteShellArgument(remoteZip)} 2>/dev/null || ` +
      `wc -c < ${quoteShellArgument(remoteZip)}`,
    { timeoutMs: STAT_TIMEOUT_MS }
  )
  const lastLine = sized.stdout.trim().split('\n').at(-1)?.trim() ?? ''
  const size = Number.parseInt(lastLine, 10)
  if (!Number.isFinite(size) || size <= 0) {
    throw new SiteRunStepError(
      REMOTE_FETCH_STEP,
      `Could not determine the size of the remote archive (${lastLine || 'no output'}).`
    )
  }
  return size
}

/**
 * Where the content tree lives inside the LOCAL checkout: `app` for Bedrock, `wp-content`
 * otherwise. ocsites hardcoded `wp-content` on both sides, so syncing uploads into a Bedrock site
 * wrote them to a directory WordPress never reads.
 */
export async function resolveLocalContentDirectory(wpDir: string): Promise<string> {
  try {
    const [core, content] = await Promise.all([
      stat(path.join(wpDir, 'wp', 'wp-load.php')),
      stat(path.join(wpDir, 'app'))
    ])
    if (core.isFile() && content.isDirectory()) {
      return 'app'
    }
  } catch {
    // Not Bedrock, or the probe is unreadable — the standard layout is the right fallback.
  }
  return 'wp-content'
}

function formatMb(bytes: number): string {
  return (bytes / BYTES_PER_MB).toFixed(1)
}

/** Fail-open GC so a site's download directory cannot grow without bound. */
async function pruneDownloads(downloadDir: string): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(downloadDir)
  } catch {
    return
  }
  const cutoff = Date.now() - DOWNLOAD_MAX_AGE_MS
  const zips: { path: string; mtimeMs: number }[] = []
  for (const name of entries) {
    if (!name.endsWith('.zip')) {
      continue
    }
    const full = path.join(downloadDir, name)
    try {
      zips.push({ path: full, mtimeMs: (await stat(full)).mtimeMs })
    } catch {
      continue
    }
  }
  zips.sort((left, right) => right.mtimeMs - left.mtimeMs)
  for (const [index, zip] of zips.entries()) {
    if (index < KEEP_DOWNLOAD_ZIPS || zip.mtimeMs >= cutoff) {
      continue
    }
    // The extraction directory shares the zip's timestamp prefix, so it goes with it.
    await Promise.all([
      unlink(zip.path).catch(() => undefined),
      rm(zip.path.replace(/\.zip$/, ''), { recursive: true, force: true }).catch(() => undefined)
    ])
  }
}
