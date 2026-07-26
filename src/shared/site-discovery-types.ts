// Live view of what is actually on disk under the folders that hold the user's projects.
//
// Muster has no configured "sites root" — projects are added one at a time — so the roots are
// derived: the distinct parent directories of the repos and sites already known. That is why the
// root set is recomputed rather than stored, and why it can change while the app is running.
//
// Two separate concerns share this file because they are two halves of one feature:
//   - watching those roots so the lists stop going stale (SiteRootsChangedEvent)
//   - listing the site-shaped folders found in them (SiteDiscoveryResult)

/** Why a refresh fired. Useful in logs when a watcher silently stops delivering on a volume. */
export type SiteRootsChangeReason =
  /** fs.watch reported a directory-entry change. */
  | 'watch'
  /** The periodic safety-net sweep — covers filesystems where fs.watch misses events. */
  | 'sweep'
  /** A repo or site was added/removed, so the derived root set itself moved. */
  | 'roots-changed'

export type SiteRootsChangedEvent = {
  reason: SiteRootsChangeReason
  roots: string[]
  at: number
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
  roots: string[]
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
/** Guards against a user whose repos are scattered across dozens of unrelated parents. */
export const SITE_ROOTS_MAX = 12
/** Keeps one pathological directory from turning the Sites page into a file browser. */
export const SITE_CANDIDATES_MAX = 500
