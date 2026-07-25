// Move a freshly fetched directory into the local checkout, optionally keeping the old one.
//
// Shared by uploads sync, uploads-subdir sync and plugin sync, which in ocsites each carried their
// own copy of this dance (mcp_server.py:1885, :1994, :2318). One copy, one rollback path.
//
// Two things the Python got for free that Node does not:
//   * `shutil.move` falls back to copy+delete across filesystems. `fs.rename` raises EXDEV, and a
//     site checkout on an external volume with the download cache in userData is the normal case
//     here, not an edge case.
//   * `Path.exists()` follows symlinks. A broken symlink at the target must still be replaced, so
//     every probe below is an lstat.

import type { Stats } from 'node:fs'
import { cp, lstat, mkdir, rename, rm, unlink } from 'node:fs/promises'
import path from 'node:path'
import { SiteRunStepError } from './pipeline-contract'

export const LOCAL_SWAP_STEP = 'local-tree-swap'

const BACKUP_MARKER = 'muster-backup'

export type LocalTreeSwapRequest = {
  /** The fetched tree. Consumed: it is moved, not copied, when the filesystems match. */
  source: string
  /** Final location inside the checkout. Replaced if anything is already there. */
  target: string
  /** Rename whatever is at `target` aside instead of deleting it. */
  backup: boolean
}

export type LocalTreeSwapResult = {
  target: string
  /** Null when nothing was there, or when `backup` was false. */
  backupPath: string | null
}

export async function swapLocalTree(request: LocalTreeSwapRequest): Promise<LocalTreeSwapResult> {
  const existing = await lstatOrNull(request.target)
  let backupPath: string | null = null
  try {
    if (existing) {
      if (request.backup) {
        backupPath = await nextBackupPath(request.target)
        await rename(request.target, backupPath)
      } else if (existing.isDirectory()) {
        await rm(request.target, { recursive: true, force: true })
      } else {
        await unlink(request.target)
      }
    }
    await mkdir(path.dirname(request.target), { recursive: true })
    await moveAcrossFilesystems(request.source, request.target)
  } catch (error) {
    // Put the original back before reporting, so a failed sync is not also a data loss.
    if (backupPath && !(await lstatOrNull(request.target))) {
      await rename(backupPath, request.target).catch(() => undefined)
      backupPath = null
    }
    const detail = error instanceof Error ? error.message : String(error)
    throw new SiteRunStepError(
      LOCAL_SWAP_STEP,
      `Could not replace ${request.target}: ${detail}${
        backupPath ? ` — the previous copy is at ${backupPath}` : ''
      }`
    )
  }
  return { target: request.target, backupPath }
}

async function moveAcrossFilesystems(source: string, target: string): Promise<void> {
  try {
    await rename(source, target)
    return
  } catch (error) {
    const crossDevice =
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'EXDEV'
    if (!crossDevice) {
      throw error
    }
  }
  // EXDEV: copy then drop the source, mirroring shutil.move. `force` on the cleanup because the
  // copy already succeeded — a leftover in the download cache is pruned later either way.
  await cp(source, target, { recursive: true, preserveTimestamps: true })
  await rm(source, { recursive: true, force: true })
}

/** `<target>.muster-backup-<epoch>`, with a counter when that name is taken. */
async function nextBackupPath(target: string): Promise<string> {
  const base = `${target}.${BACKUP_MARKER}-${Math.floor(Date.now() / 1000)}`
  for (let suffix = 0; suffix < 100; suffix++) {
    const candidate = suffix === 0 ? base : `${base}-${suffix}`
    if (!(await lstatOrNull(candidate))) {
      return candidate
    }
  }
  throw new SiteRunStepError(
    LOCAL_SWAP_STEP,
    `Could not find a free backup name next to ${target}.`
  )
}

async function lstatOrNull(target: string): Promise<Stats | null> {
  try {
    return await lstat(target)
  } catch {
    return null
  }
}
