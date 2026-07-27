// Live view of what is actually on disk under the folders that hold the user's projects.
//
// Two sources of roots, in precedence order:
//   - the user's configured list (SiteRootEntry), persisted in order and never silently pruned
//   - when that list is empty, the derived set: the distinct parent directories of the repos and
//     sites already known, recomputed rather than stored, so it can change while the app is running
//
// Three separate concerns share this file because they are three parts of one feature:
//   - which folders the user chose to source sites from (SiteRootEntry)
//   - watching those roots so the lists stop going stale (SiteRootsChangedEvent)
//   - listing the site-shaped folders found in them (SiteDiscoveryResult)

/** Why a refresh fired. Useful in logs when a watcher silently stops delivering on a volume. */
export type SiteRootsChangeReason =
  /** fs.watch reported a directory-entry change. */
  | 'watch'
  /** The periodic safety-net sweep — covers filesystems where fs.watch misses events. */
  | 'sweep'
  /** The root set moved: the user edited the configured list, or a repo/site moved the derived one. */
  | 'roots-changed'

export type SiteRootsChangedEvent = {
  reason: SiteRootsChangeReason
  roots: string[]
  at: number
}

/**
 * One entry of the user's configured root list.
 *
 * `missing` rather than removal: a path on an unmounted volume is a correct configuration the
 * machine cannot reach right now. Dropping it would destroy the user's setting the first time they
 * ejected a drive, so it persists, renders as unreachable, and resolves again when the volume
 * returns — the `⚠ missing` marker ocsites shows in its settings screen.
 */
export type SiteRootEntry = {
  path: string
  missing: boolean
}

/**
 * How a folder earned its place in the list. `localwp` and `wordpress` are real sites; `git` is a
 * repository that may become one. Anything else is not reported at all.
 */
export type DiscoveredSiteKind = 'localwp' | 'wordpress' | 'git'

export type DiscoveredSiteCandidate = {
  path: string
  displayName: string
  kind: DiscoveredSiteKind
  /** Separate from `kind` because a WordPress install is very often also a repo. */
  isGitRepo: boolean
}

export type SiteDiscoveryResult = {
  /** The roots actually scanned, in the order they were scanned. */
  roots: string[]
  /**
   * Where a new site should land by default. With a configured list that is its first reachable
   * entry; otherwise the derived root accounting for the most existing projects. Either way
   * `roots` is not ordered by it — the derived set is alphabetical for stable rendering — so the
   * destination has to be reported separately. Empty means "ask, do not guess".
   */
  primaryRoot: string
  /** Never includes a path that already has a Site record — the caller merges, it does not dedupe. */
  candidates: DiscoveredSiteCandidate[]
  scannedAt: number
  /** True when the scan hit its cap; the list is still usable, just not exhaustive. */
  truncated: boolean
}

/** Depth-1 only: adding or removing a project changes a direntry in the root, nothing deeper. */
export const SITE_ROOT_SCAN_DEPTH = 1
/** Bursts are normal — a clone writes many entries — so collapse them into one refresh. */
export const SITE_ROOTS_DEBOUNCE_MS = 400
/** Safety net for filesystems where fs.watch is unreliable (network shares, some virtual FS). */
export const SITE_ROOTS_SWEEP_MS = 60_000
/**
 * One cap for both root sets: it guards the derived set against repos scattered over dozens of
 * unrelated parents, and the configured list against a hand-edited data file.
 */
export const SITE_ROOTS_MAX = 12
/** Keeps one pathological directory from turning the Sites page into a file browser. */
export const SITE_CANDIDATES_MAX = 500
