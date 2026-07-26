// Lists the site-shaped folders sitting in the roots that hold the user's projects.
//
// Separate from project-groups/nested-repo-discovery on purpose: that scanner answers "which git
// repos live under the one folder the user just picked" with a deep, gitignore-aware traversal, and
// it is allowed to be slow because a human is waiting on a dialog. This one answers "what is on
// disk right now" and reruns on every watch tick, so it stays one listing per root plus four
// cheap existence probes per child.
import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  SITE_CANDIDATES_MAX,
  type DiscoveredSiteCandidate,
  type DiscoveredSiteKind,
  type SiteDiscoveryResult
} from '../../shared/site-discovery-types'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { localWpWordPressRoot } from './localwp-host'

type SiteCandidateDirectoryEntry = {
  name: string
  isDirectory: boolean
  isSymlink?: boolean
}

type SiteCandidateFilesystem = {
  readDirectory: (dirPath: string) => Promise<SiteCandidateDirectoryEntry[]>
  pathExists: (targetPath: string) => Promise<boolean>
  joinPath: (parentPath: string, childName: string) => string
  basename: (path: string) => string
}

/**
 * Directories that are never a project and are exactly the ones that are enormous. `.Trash`,
 * `.cache` and every other dot-prefixed name fall out of the dot-prefix check at the call site.
 */
const SKIPPED_DIR_NAMES: Record<string, true> = { node_modules: true, vendor: true }

async function readLocalDirectory(dirPath: string): Promise<SiteCandidateDirectoryEntry[]> {
  // Why: Dirent flags answer "directory?" and "symlink?" without a stat per child, and symlinks
  // must stay unfollowed so a link pointing back at a parent cannot list the same project twice.
  const entries = await readdir(dirPath, { withFileTypes: true })
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
    isSymlink: entry.isSymbolicLink()
  }))
}

async function localPathExists(targetPath: string): Promise<boolean> {
  try {
    // Why: stat, not lstat — a `.git` file (worktree/submodule link) counts just as much as a
    // `.git` directory, and either shape must report the folder as a repository.
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

const LOCAL_FILESYSTEM: SiteCandidateFilesystem = {
  readDirectory: readLocalDirectory,
  pathExists: localPathExists,
  joinPath: join,
  basename
}

type ClassifiedDirectory = {
  kind: DiscoveredSiteKind
  isGitRepo: boolean
}

async function classifyDirectory(
  dirPath: string,
  filesystem: SiteCandidateFilesystem
): Promise<ClassifiedDirectory | null> {
  const [hasLocalWpConfig, hasWpConfig, hasGitEntry, hasNestedGitEntry] = await Promise.all([
    filesystem.pathExists(filesystem.joinPath(localWpWordPressRoot(dirPath), 'wp-config.php')),
    filesystem.pathExists(filesystem.joinPath(dirPath, 'wp-config.php')),
    filesystem.pathExists(filesystem.joinPath(dirPath, '.git')),
    filesystem.pathExists(filesystem.joinPath(localWpWordPressRoot(dirPath), '.git'))
  ])
  // Why: a LocalWP site keeps the WordPress install two levels down, so it can also carry a
  // top-level wp-config.php left over from a migration. Local's layout is the more specific
  // answer and the one the Sites page can actually start and stop, so it wins.
  const kind: DiscoveredSiteKind | null = hasLocalWpConfig
    ? 'localwp'
    : hasWpConfig
      ? 'wordpress'
      : hasGitEntry
        ? 'git'
        : null
  // Why: isGitRepo is reported independently of kind because a WordPress install is very often
  // also a repo, and the caller decides separately whether to offer repo actions.
  //
  // Why the second probe: a LocalWP site's checkout is the WordPress root under app/public, never
  // the folder Local manages, so a top-level-only test reports every one of them as not a repo.
  // The kind chain deliberately still reads the top-level entry: a nested repo under a folder with
  // no wp-config anywhere is not a site, and must not become a candidate on that signal alone.
  return kind ? { kind, isGitRepo: hasGitEntry || hasNestedGitEntry } : null
}

function dedupeRoots(roots: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const root of roots) {
    const key = normalizeRuntimePathForComparison(root)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(root)
  }
  return deduped
}

/**
 * Depth-1 scan (SITE_ROOT_SCAN_DEPTH in the shared contract): a project folder is always a direct
 * direntry of the root it was added from, so one listing per root is the whole scan.
 *
 * Never throws for filesystem reasons. Roots are derived from store paths, so an ejected volume or
 * a deleted parent is ordinary, and an aborted scan returns what it had rather than unwinding.
 */
export async function discoverSiteCandidates(args: {
  roots: string[]
  /**
   * Where a new project should land, reported straight back on the result. Supplied rather than
   * derived here: ranking roots by density is the watcher's job, and reaching for the store would
   * cost this module its purity for a value it never reads.
   */
  primaryRoot: string
  /** Paths that already have a Site record; these must be excluded from `candidates`. */
  configuredPaths: Iterable<string>
  signal?: AbortSignal
  /** Test seam, mirroring project-groups/nested-repo-discovery; production uses the local disk. */
  filesystem?: SiteCandidateFilesystem
}): Promise<SiteDiscoveryResult> {
  const filesystem = args.filesystem ?? LOCAL_FILESYSTEM
  const configuredKeys = new Set<string>()
  for (const configuredPath of args.configuredPaths) {
    configuredKeys.add(normalizeRuntimePathForComparison(configuredPath))
  }
  const roots = dedupeRoots(args.roots)
  const candidates: DiscoveredSiteCandidate[] = []
  const seenCandidateKeys = new Set<string>()
  let truncated = false

  for (const root of roots) {
    if (args.signal?.aborted || truncated) {
      break
    }
    let entries: SiteCandidateDirectoryEntry[]
    try {
      entries = await filesystem.readDirectory(root)
    } catch {
      // Why: a root that cannot be read contributes nothing. It is not an error state — the root
      // set is recomputed from the store and will drop the dead entry on its own.
      continue
    }
    for (const entry of entries) {
      if (args.signal?.aborted) {
        break
      }
      if (!entry.isDirectory || entry.isSymlink) {
        continue
      }
      if (entry.name.startsWith('.') || SKIPPED_DIR_NAMES[entry.name]) {
        continue
      }
      const dirPath = filesystem.joinPath(root, entry.name)
      const dirKey = normalizeRuntimePathForComparison(dirPath)
      if (configuredKeys.has(dirKey) || seenCandidateKeys.has(dirKey)) {
        continue
      }
      const classified = await classifyDirectory(dirPath, filesystem)
      if (!classified) {
        continue
      }
      // Why: the cap is checked only once a real candidate is in hand, so a root padded with
      // uninteresting folders cannot report truncation when nothing was actually dropped.
      if (candidates.length >= SITE_CANDIDATES_MAX) {
        truncated = true
        break
      }
      seenCandidateKeys.add(dirKey)
      candidates.push({
        path: dirPath,
        displayName: filesystem.basename(dirPath),
        kind: classified.kind,
        isGitRepo: classified.isGitRepo
      })
    }
  }

  // Why: readdir order is filesystem-defined, and this list feeds a UI that must not reshuffle
  // between two scans that found the same folders.
  candidates.sort((left, right) => {
    const byName = left.displayName
      .toLowerCase()
      .localeCompare(right.displayName.toLowerCase(), 'en')
    return byName !== 0 ? byName : left.path.localeCompare(right.path, 'en')
  })

  return {
    roots,
    primaryRoot: args.primaryRoot,
    candidates,
    scannedAt: Date.now(),
    truncated
  }
}
