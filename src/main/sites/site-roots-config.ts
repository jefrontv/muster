// The user's own answer to "which folders do my sites live in?", persisted in their order.
//
// Ported from ocsites' `sites_roots` (src/ocsites/config.py): an ordered list, deduped by resolved
// path, where a path that is not currently a directory is shown as missing rather than dropped.
// Muster differs in one place — ocsites falls back to a single hardcoded DEFAULT_ROOT and refuses
// to delete the last entry, whereas Muster already derives roots from the repos and sites in the
// store, so an empty list is a valid state that simply hands discovery back to that derivation.
//
// Nesting is allowed. A root inside another root is not redundant here: discovery is depth-1
// (SITE_ROOT_SCAN_DEPTH), so `<Sites>` lists `<Sites>/mpac` as one folder and never sees
// `<Sites>/mpac/*`. Only `<Sites>/mpac` itself can surface those, and the scanner dedupes by path,
// so the same site cannot appear twice. This is the same reasoning `rankSiteRoots` already applies
// to the derived set, kept identical so the two root sources do not disagree.

import { statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { SITE_ROOTS_MAX, type SiteRootEntry } from '../../shared/site-discovery-types'

/** The slice of `Store` this module owns. Structural so a test supplies an array, not a data file. */
export type SiteRootsConfigStore = {
  getConfiguredSiteRoots: () => readonly string[]
  setConfiguredSiteRoots: (roots: readonly string[]) => void
}

function isReachable(candidate: string): boolean {
  try {
    return statSync(candidate).isDirectory()
  } catch {
    // ENOENT, EPERM, an ejected volume: all "cannot use it right now", none "forget it".
    return false
  }
}

/**
 * The persisted list, made safe to use: strings only, trimmed, absolute, deduped case/separator-
 * insensitively, order preserved, capped.
 *
 * Applied on read as well as on write because `orca-data.json` is a plain file a user can edit,
 * and a malformed entry must cost that entry rather than the whole feature.
 */
export function normalizeConfiguredSiteRoots(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const seen = new Set<string>()
  const roots: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      continue
    }
    const trimmed = entry.trim()
    if (trimmed.length === 0 || !isAbsolute(trimmed)) {
      continue
    }
    const key = normalizeRuntimePathForComparison(trimmed)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    roots.push(trimmed)
    if (roots.length === SITE_ROOTS_MAX) {
      break
    }
  }
  return roots
}

/** The configured list as the folder settings render it: user order, each marked reachable or not. */
export function describeConfiguredSiteRoots(store: SiteRootsConfigStore): SiteRootEntry[] {
  return normalizeConfiguredSiteRoots(store.getConfiguredSiteRoots()).map((path) => ({
    path,
    missing: !isReachable(path)
  }))
}

function indexOfRoot(roots: readonly string[], target: string): number {
  const key = normalizeRuntimePathForComparison(target.trim())
  return roots.findIndex((root) => normalizeRuntimePathForComparison(root) === key)
}

/**
 * Validates against the real filesystem, never against the list alone: the picker can hand back a
 * path that stopped being a directory between the dialog opening and this call.
 *
 * Throws rather than returning a tagged failure so the IPC layer's existing try/catch turns every
 * rejection into the same `{ ok: false, error }` shape the rest of the sites surface uses.
 */
export function addConfiguredSiteRoot(
  store: SiteRootsConfigStore,
  candidate: string
): SiteRootEntry[] {
  const path = candidate.trim()
  if (path.length === 0) {
    throw new Error('Choose a folder to add.')
  }
  if (!isAbsolute(path)) {
    throw new Error(`Not an absolute path: ${path}`)
  }
  let stats: { isDirectory: () => boolean }
  try {
    stats = statSync(path)
  } catch {
    throw new Error(`That folder does not exist: ${path}`)
  }
  if (!stats.isDirectory()) {
    throw new Error(`Not a folder: ${path}`)
  }
  const roots = normalizeConfiguredSiteRoots(store.getConfiguredSiteRoots())
  if (indexOfRoot(roots, path) !== -1) {
    throw new Error(`Already listed: ${path}`)
  }
  if (roots.length >= SITE_ROOTS_MAX) {
    throw new Error(`Remove a folder first — at most ${SITE_ROOTS_MAX} can be listed.`)
  }
  store.setConfiguredSiteRoots([...roots, path])
  return describeConfiguredSiteRoots(store)
}

/**
 * Removing the last root is allowed: the empty list is the documented "derive them for me" state,
 * not a broken one. This is where Muster deliberately diverges from ocsites, which keeps one entry
 * because it has nothing to fall back to.
 */
export function removeConfiguredSiteRoot(
  store: SiteRootsConfigStore,
  target: string
): SiteRootEntry[] {
  const roots = normalizeConfiguredSiteRoots(store.getConfiguredSiteRoots())
  const index = indexOfRoot(roots, target)
  if (index === -1) {
    throw new Error(`Not a configured folder: ${target}`)
  }
  store.setConfiguredSiteRoots(roots.toSpliced(index, 1))
  return describeConfiguredSiteRoots(store)
}

/**
 * Keyed on the path, not on a "from" index: a second window can add or remove an entry between the
 * renderer rendering its list and the user clicking an arrow, and an index-keyed move would then
 * reorder the wrong row. `toIndex` is clamped for the same reason.
 */
export function reorderConfiguredSiteRoot(
  store: SiteRootsConfigStore,
  target: string,
  toIndex: number
): SiteRootEntry[] {
  const roots = normalizeConfiguredSiteRoots(store.getConfiguredSiteRoots())
  const index = indexOfRoot(roots, target)
  if (index === -1) {
    throw new Error(`Not a configured folder: ${target}`)
  }
  if (!Number.isFinite(toIndex)) {
    throw new Error(`Not a position: ${toIndex}`)
  }
  const destination = Math.min(Math.max(Math.trunc(toIndex), 0), roots.length - 1)
  if (destination === index) {
    return describeConfiguredSiteRoots(store)
  }
  store.setConfiguredSiteRoots(roots.toSpliced(index, 1).toSpliced(destination, 0, roots[index]))
  return describeConfiguredSiteRoots(store)
}
