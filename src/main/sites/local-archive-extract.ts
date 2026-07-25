// Path-traversal-safe zip extraction, ported from ocsites deploy/utils.py::extract_zip.
//
// No zip library on purpose: we shell out to the system `unzip`. A site's base.zip is core
// WordPress and its content zip carries every plugin, so decompressing through the main process
// would put hundreds of MB through Electron's heap for no gain, and `unzip` already restores
// modes and directory structure the way the Python port did.
//
// POSIX-only by construction — macOS and Linux both ship `unzip`; on Windows the spawn fails
// ENOENT and surfaces as the "install unzip" message below.

import { chmod, lstat, mkdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { streamCommand, type StreamCommandResult } from '../lib/stream-command'
import { SiteRunCancelledError, type SiteRunContext, SiteRunStepError } from './pipeline-contract'

const UNZIP_BINARY = 'unzip'

// The entry list of a full WordPress tree is a few hundred KB; the 10MB default would silently
// truncate a pathological site and we would then "validate" only part of the archive.
const ENTRY_LIST_MAX_BYTES = 64 * 1024 * 1024

const MISSING_UNZIP_MESSAGE =
  'The `unzip` command is required to extract site archives but was not found. Install it ' +
  '(macOS ships it at /usr/bin/unzip; Debian/Ubuntu: `apt install unzip`) and run the import again.'

/**
 * Rejects entries that would escape the target directory (zip-slip) or that carry an absolute
 * path. Checked for every entry BEFORE anything is written, so a malicious archive cannot leave
 * half its payload behind. `unzip` independently refuses `..` components unless given `-:`, so
 * this is the second of two layers.
 *
 * One deliberate difference from the Python port: `unzip` restores a stored symlink as a symlink,
 * where zipfile.extract wrote it as a regular file. A name check cannot see through a symlink, so
 * an archive that stores an escaping symlink and then writes through it is out of scope here —
 * acceptable because the archive is one we just built ourselves on the user's own server.
 */
export function assertSafeZipEntries(entries: string[], targetRoot: string, step: string): void {
  const rootWithSeparator = targetRoot.endsWith(path.sep) ? targetRoot : `${targetRoot}${path.sep}`
  for (const entry of entries) {
    if (path.isAbsolute(entry) || path.win32.isAbsolute(entry)) {
      throw new SiteRunStepError(step, `Absolute zip entry blocked: ${entry}`)
    }
    const resolved = path.resolve(targetRoot, entry)
    if (resolved !== targetRoot && !resolved.startsWith(rootWithSeparator)) {
      throw new SiteRunStepError(step, `Unsafe zip entry blocked: ${entry}`)
    }
  }
}

/**
 * Extracts `archivePath` over `targetDirectory`, creating it if needed. Existing files are
 * overwritten.
 */
export async function extractZipArchive(
  context: SiteRunContext,
  step: string,
  archivePath: string,
  targetDirectory: string
): Promise<void> {
  await mkdir(targetDirectory, { recursive: true })
  // realpath so a symlinked or /var-vs-/private/var target still compares against the same root
  // the entries resolve into.
  const targetRoot = await realpath(targetDirectory)

  const entries = await listArchiveEntries(context, step, archivePath)
  assertSafeZipEntries(entries, targetRoot, step)
  await makeExistingTargetsWritable(entries, targetRoot)

  context.throwIfCancelled()
  const extracted = await runUnzip(context, step, ['-o', '-q', archivePath, '-d', targetRoot])
  // unzip reserves 1 for warnings (a stored path it had to mangle, a skipped special file) and
  // 2+ for real errors. Failing on a warning would abort imports that Python's zipfile completed.
  if (extracted.code > 1) {
    const detail =
      extracted.stderr.trim() || extracted.stdout.trim() || `unzip exited ${extracted.code}`
    throw new SiteRunStepError(step, `Failed to extract ${path.basename(archivePath)}: ${detail}`)
  }
  if (extracted.code === 1) {
    context.log(`unzip reported warnings for ${path.basename(archivePath)}`)
  }
}

/**
 * Entry names via `unzip -Z1` (zipinfo, names only). One name per line, so an entry name
 * containing a newline is indistinguishable from two entries — such a name cannot survive the
 * `find -print | zip -@` pipeline that produced these archives either.
 */
async function listArchiveEntries(
  context: SiteRunContext,
  step: string,
  archivePath: string
): Promise<string[]> {
  const listed = await runUnzip(context, step, ['-Z1', archivePath], ENTRY_LIST_MAX_BYTES)
  if (listed.code !== 0) {
    const detail = listed.stderr.trim() || `unzip exited ${listed.code}`
    throw new SiteRunStepError(step, `Could not read ${path.basename(archivePath)}: ${detail}`)
  }
  if (listed.truncated) {
    throw new SiteRunStepError(
      step,
      `${path.basename(archivePath)} lists too many entries to validate safely.`
    )
  }
  return listed.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

async function runUnzip(
  context: SiteRunContext,
  step: string,
  args: string[],
  maxBytes?: number
): Promise<StreamCommandResult> {
  try {
    return await streamCommand(UNZIP_BINARY, args, {
      signal: context.signal,
      // No deadline: extracting a large content zip on a slow disk is legitimately slow, and a
      // half-extracted webroot is worse than a slow one.
      timeoutMs: 0,
      ...(maxBytes === undefined ? {} : { maxBytes })
    })
  } catch (error) {
    // streamCommand rejects only on spawn failure and abort.
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SiteRunCancelledError()
    }
    const detail = error instanceof Error ? error.message : String(error)
    throw new SiteRunStepError(step, `${MISSING_UNZIP_MESSAGE} (${detail})`)
  }
}

/**
 * Clears the read-only bit on files the archive is about to overwrite. Nested plugin
 * `.git/objects/*` are mode 0444 and would otherwise fail extraction with EACCES.
 */
async function makeExistingTargetsWritable(entries: string[], targetRoot: string): Promise<void> {
  for (const entry of entries) {
    if (entry.endsWith('/')) {
      continue
    }
    const destination = path.resolve(targetRoot, entry)
    try {
      const stats = await lstat(destination)
      if (!stats.isDirectory() && (stats.mode & 0o200) === 0) {
        await chmod(destination, 0o666)
      }
    } catch {
      // Absent (the common case) or unreadable — let unzip report anything that actually matters.
    }
  }
}
