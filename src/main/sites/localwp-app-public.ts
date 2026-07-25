// Filesystem surgery on a LocalWP site's app/public directory: clearing Local's generated scaffold,
// recovering git-tracked files, and relocating a plain WordPress checkout into it.
//
// Ported from ocsites create_localwp.empty_app_public / restore_git_app_public plus the standard-WP
// relocate loop in tui_deploy (:3040-3070). Every mutation goes through an injected seam so the
// migration is testable without touching a real project.

import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { localWpWordPressRoot, type LocalWpHost } from './localwp-host'

export type LocalWpFileOperations = {
  listDirectory: (dirPath: string) => Promise<string[]>
  pathExists: (filePath: string) => Promise<boolean>
  move: (from: string, to: string) => Promise<void>
  removeRecursive: (target: string) => Promise<void>
  readTextFile: (filePath: string) => Promise<string>
  writeTextFile: (filePath: string, contents: string) => Promise<void>
  makeDirectory: (dirPath: string) => Promise<void>
}

export type LocalWpFileOutcome = { ok: boolean; message: string }

export function createLocalWpFileOperations(
  overrides: Partial<LocalWpFileOperations> = {}
): LocalWpFileOperations {
  return {
    listDirectory: async (dirPath) => {
      try {
        return await readdir(dirPath)
      } catch {
        return []
      }
    },
    pathExists: async (filePath) => {
      try {
        await stat(filePath)
        return true
      } catch {
        return false
      }
    },
    move: async (from, to) => {
      try {
        await rename(from, to)
      } catch (error) {
        // rename cannot cross filesystems; fall back to copy-then-delete like shutil.move.
        if (!(error instanceof Error && 'code' in error && error.code === 'EXDEV')) {
          throw error
        }
        await cp(from, to, { recursive: true })
        await rm(from, { recursive: true, force: true })
      }
    },
    removeRecursive: (target) => rm(target, { recursive: true, force: true }),
    readTextFile: (filePath) => readFile(filePath, 'utf8'),
    writeTextFile: (filePath, contents) => writeFile(filePath, contents, 'utf8'),
    makeDirectory: async (dirPath) => {
      await mkdir(dirPath, { recursive: true })
    },
    ...overrides
  }
}

/** Deletes everything inside app/public while keeping the directory itself. */
export async function emptyAppPublic(
  sitePath: string,
  fileOperations: LocalWpFileOperations
): Promise<LocalWpFileOutcome> {
  const appPublic = localWpWordPressRoot(sitePath)
  if (!(await fileOperations.pathExists(appPublic))) {
    return { ok: false, message: `app/public not found at ${appPublic}` }
  }
  try {
    for (const entry of await fileOperations.listDirectory(appPublic)) {
      await fileOperations.removeRecursive(path.join(appPublic, entry))
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
  return { ok: true, message: 'Cleared app/public' }
}

/**
 * Recovers git-tracked files under app/public that Local's site scaffold may have overwritten.
 * A nonzero exit is not an error — the directory simply may not have been modified.
 */
export async function restoreGitAppPublic(
  sitePath: string,
  host: LocalWpHost
): Promise<LocalWpFileOutcome> {
  const result = await host.run('git', ['restore', 'app/public'], {
    cwd: sitePath,
    timeoutMs: 30_000
  })
  return result.code === 0
    ? { ok: true, message: 'Restored app/public from git' }
    : { ok: true, message: '' }
}

/**
 * Moves every top-level entry of the project (except `app`, which Local owns) into app/public.
 *
 * A pre-existing destination is removed first. ocsites relied on shutil.move, which nests
 * `wp-content` inside an existing `app/public/wp-content` instead of replacing it; the project's own
 * file is always the authoritative one, so replace rather than nest.
 */
export async function moveRootEntriesIntoAppPublic(
  sitePath: string,
  fileOperations: LocalWpFileOperations,
  onStatus?: (message: string) => void
): Promise<LocalWpFileOutcome & { moved: string[] }> {
  const appPublic = localWpWordPressRoot(sitePath)
  await fileOperations.makeDirectory(appPublic)
  const moved: string[] = []
  for (const entry of await listRootEntriesToMove(sitePath, fileOperations)) {
    const destination = path.join(appPublic, entry)
    try {
      if (await fileOperations.pathExists(destination)) {
        await fileOperations.removeRecursive(destination)
      }
      await fileOperations.move(path.join(sitePath, entry), destination)
      moved.push(entry)
      onStatus?.(`  moved ${entry}`)
    } catch (error) {
      return {
        ok: false,
        moved,
        message: `Failed to move ${entry}: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
  return { ok: true, moved, message: `Moved ${moved.length} entries into app/public` }
}

/** Top-level project entries the migration relocates, in a stable order. */
export async function listRootEntriesToMove(
  sitePath: string,
  fileOperations: LocalWpFileOperations
): Promise<string[]> {
  return (await fileOperations.listDirectory(sitePath)).filter((entry) => entry !== 'app').sort()
}

/**
 * Points the relocated wp-config.php at Local's MySQL. Local reaches its per-site daemon through the
 * socket configured for the PHP process, so DB_HOST must be plain 'localhost' — an inherited
 * 127.0.0.1 from a MAMP setup forces TCP and fails.
 */
export async function rewriteLocalDbHost(
  wpConfigPath: string,
  fileOperations: LocalWpFileOperations
): Promise<boolean> {
  if (!(await fileOperations.pathExists(wpConfigPath))) {
    return false
  }
  const contents = await fileOperations.readTextFile(wpConfigPath)
  const rewritten = contents.replace(
    /define\s*\(\s*['"]DB_HOST['"]\s*,\s*['"][^'"]*['"]\s*\)/g,
    `define('DB_HOST', 'localhost')`
  )
  if (rewritten === contents) {
    return false
  }
  await fileOperations.writeTextFile(wpConfigPath, rewritten)
  return true
}
