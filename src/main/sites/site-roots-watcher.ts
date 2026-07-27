// Keeps the folders that hold the user's projects under observation, so the Sites page stops
// showing a snapshot taken the last time someone opened a dialog.
//
// Two sources, in precedence order. The user's configured list (site-roots-config.ts) wins when it
// has entries. When it is empty the roots are derived — the distinct parent directories of the
// repos and sites already in the store — because a user who never opened the folder settings must
// still see their sites. Either set moves while the app is running, which is why nothing here is
// cached beyond the current resolution and why `refreshRoots` exists at all.
//
// Depth-1 only, never recursive. A recursive watch on a WordPress checkout descends node_modules,
// vendor and wp-content/uploads — tens of thousands of handles for information this feature never
// reads, because adding or removing a project only ever changes a direntry directly inside a root.

import { statSync, watch as watchDirectory } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import {
  SITE_ROOTS_DEBOUNCE_MS,
  SITE_ROOTS_MAX,
  SITE_ROOTS_SWEEP_MS,
  type SiteRootsChangedEvent,
  type SiteRootsChangeReason
} from '../../shared/site-discovery-types'
import { normalizeConfiguredSiteRoots } from './site-roots-config'

/**
 * The slice of `Store` this module reads. Structural so a test supplies two arrays and a list
 * instead of a persistence file, and so it stays obvious that nothing here writes.
 */
export type SiteRootsStore = {
  getRepos: () => readonly { path: string; connectionId?: string | null }[]
  listSites: () => readonly { path: string }[]
  getConfiguredSiteRoots: () => readonly string[]
}

/**
 * Opaque to this module: whatever the injected scheduler returns is only ever handed straight back
 * to its matching clear. `number` is in the union so a test scheduler can hand out plain counters.
 */
export type SiteRootsTimerToken = NodeJS.Timeout | number

/** The only surface of an `fs.FSWatcher` used here — close it, and hear about async failures. */
export type SiteRootsWatchHandle = {
  close: () => void
  on: (event: 'error', listener: (error: Error) => void) => unknown
}

export type SiteRootsWatchFn = (
  root: string,
  options: { recursive: false },
  listener: () => void
) => SiteRootsWatchHandle

export type SiteRootsWatcherOptions = {
  /** Absent means the watcher only maintains `getRoots()`; nothing observes the changes. */
  onChange?: (event: SiteRootsChangedEvent) => void
  watch?: SiteRootsWatchFn
  setTimeout?: (handler: () => void, ms: number) => SiteRootsTimerToken
  clearTimeout?: (token: SiteRootsTimerToken) => void
  setInterval?: (handler: () => void, ms: number) => SiteRootsTimerToken
  clearInterval?: (token: SiteRootsTimerToken) => void
  now?: () => number
  directoryExists?: (candidate: string) => boolean
}

export type SiteRootsWatcherHandle = {
  stop: () => void
  getRoots: () => string[]
  refreshRoots: () => void
}

/** Both sides come from `deriveSiteRoots`, so they are already in the same stable order. */
export function siteRootsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((root, index) => root === right[index])
}

function directoryExistsOnDisk(candidate: string): boolean {
  try {
    // statSync, not lstatSync: a symlinked projects folder is a perfectly ordinary setup.
    return statSync(candidate).isDirectory()
  } catch {
    return false
  }
}

/** Binds the one `fs.watch` overload this module wants; the rest of the file stays FS-agnostic. */
function watchDirectoryShallow(
  root: string,
  options: { recursive: false },
  listener: () => void
): SiteRootsWatchHandle {
  return watchDirectory(root, options, listener)
}

function parentDirectory(candidate: string): string | null {
  if (!candidate || !isAbsolute(candidate)) {
    return null
  }
  const parent = dirname(candidate)
  // `dirname` is a fixed point at the filesystem root, and a project sitting directly on `/` or
  // `C:\` has no parent worth watching.
  return parent === candidate ? null : parent
}

function* collectParentDirectories(store: SiteRootsStore): Generator<string> {
  for (const repo of store.getRepos()) {
    // A remote repo's path names a directory on the SSH host. Watching it locally either fails or,
    // worse, silently matches an unrelated local directory that happens to share the name.
    if (repo.connectionId) {
      continue
    }
    const parent = parentDirectory(repo.path)
    if (parent !== null) {
      yield parent
    }
  }
  for (const site of store.listSites()) {
    const parent = parentDirectory(site.path)
    if (parent !== null) {
      yield parent
    }
  }
}

/** A candidate root and how many repo/site entries voted for it. Ordered by `rankSiteRoots`. */
type RankedSiteRoot = { root: string; entries: number }

/**
 * Candidate roots in descending density order, deduped and filtered to what is actually on disk.
 *
 * Density, not mere presence: the cap has to keep the parent holding 70 repos ahead of three
 * one-off strays, so every entry votes for its parent. Ties break on path so the order is stable.
 *
 * No ancestor/descendant collapse. These watches are depth-1, so a root and a root nested inside
 * it observe disjoint sets of directory entries — neither can stand in for the other. Dropping
 * the ancestor looks tidy and is actively wrong: one repo checked out at
 * `<Sites>/mpac/<repo>` makes `<Sites>/mpac` a root, which would evict `<Sites>` itself and
 * blind the watcher to the 150 projects living directly under it.
 *
 * The churn worry that motivated collapsing (watching `$HOME` or `/Users`) is already handled by
 * ranking on density: a stray repo in the home directory earns one vote and loses the cap to any
 * real projects folder.
 */
function rankSiteRoots(
  store: SiteRootsStore,
  directoryExists: (candidate: string) => boolean
): RankedSiteRoot[] {
  const byKey = new Map<string, RankedSiteRoot>()
  for (const parent of collectParentDirectories(store)) {
    const key = normalizeRuntimePathForComparison(parent)
    const existing = byKey.get(key)
    if (existing) {
      existing.entries += 1
      continue
    }
    byKey.set(key, { root: parent, entries: 1 })
  }

  return [...byKey.values()]
    .filter((entry) => directoryExists(entry.root))
    .sort((left, right) => right.entries - left.entries || (left.root < right.root ? -1 : 1))
}

/**
 * The roots to scan and watch: the user's configured list when it has entries, otherwise the
 * derived parent directories — deduped, ranked by how many entries they account for, capped at
 * `SITE_ROOTS_MAX`, then alphabetised.
 *
 * A configured root is returned even when it is unreachable. Existence filtering belongs to the
 * derived set, where a stale parent is noise; in the configured list an ejected volume is the
 * user's setting, and dropping it here would make the watched set silently disagree with the
 * folder list the user is looking at. Scanning and watching both tolerate a dead root already.
 *
 * The trailing sort on the derived branch is what makes that set render stably, and it is also why
 * the densest root is not `roots[0]` — `derivePrimarySiteRoot` reports that separately. The
 * configured branch keeps the user's order instead, which is itself the preference.
 *
 * `directoryExists` is injected so the ranking can be exercised without touching a disk.
 */
export function deriveSiteRoots(
  store: SiteRootsStore,
  directoryExists: (candidate: string) => boolean = directoryExistsOnDisk
): string[] {
  const configured = normalizeConfiguredSiteRoots(store.getConfiguredSiteRoots())
  if (configured.length > 0) {
    return configured
  }
  return rankSiteRoots(store, directoryExists)
    .slice(0, SITE_ROOTS_MAX)
    .map((entry) => entry.root)
    .sort()
}

/**
 * Where a new project should land: the first reachable configured root, or — with nothing
 * configured — the derived root accounting for the most existing projects. Empty when the user has
 * no usable root, which the caller must treat as "ask, do not guess".
 *
 * A configured list whose every entry is offline reports empty rather than falling back to a
 * derived parent: the user named where their projects go, so cloning somewhere else because a
 * drive is unplugged would be a surprise, and asking costs one dialog.
 *
 * Never capped: the densest root is rank 0, so `SITE_ROOTS_MAX` cannot exclude it.
 */
export function derivePrimarySiteRoot(
  store: SiteRootsStore,
  directoryExists: (candidate: string) => boolean = directoryExistsOnDisk
): string {
  const configured = normalizeConfiguredSiteRoots(store.getConfiguredSiteRoots())
  if (configured.length > 0) {
    return configured.find((root) => directoryExists(root)) ?? ''
  }
  return rankSiteRoots(store, directoryExists)[0]?.root ?? ''
}

export function startSiteRootsWatcher(
  store: SiteRootsStore,
  options: SiteRootsWatcherOptions = {}
): SiteRootsWatcherHandle {
  const watch = options.watch ?? watchDirectoryShallow
  const schedule = options.setTimeout ?? setTimeout
  const unschedule = options.clearTimeout ?? clearTimeout
  const scheduleEvery = options.setInterval ?? setInterval
  const unscheduleEvery = options.clearInterval ?? clearInterval
  const now = options.now ?? Date.now
  const directoryExists = options.directoryExists ?? directoryExistsOnDisk

  const watchers = new Map<string, SiteRootsWatchHandle>()
  /** One line per root rather than per failure: a dropped network share re-fails indefinitely. */
  const loggedFailures = new Set<string>()
  let roots = deriveSiteRoots(store, directoryExists)
  let debounceToken: SiteRootsTimerToken | null = null
  let sweepToken: SiteRootsTimerToken | null = null
  let stopped = false

  function emit(reason: SiteRootsChangeReason): void {
    if (stopped) {
      return
    }
    options.onChange?.({ reason, roots: [...roots], at: now() })
  }

  function noteWatchFailure(root: string, error: unknown): void {
    if (loggedFailures.has(root)) {
      return
    }
    loggedFailures.add(root)
    console.warn(
      `[site-roots] cannot watch ${root}; the periodic sweep covers it:`,
      error instanceof Error ? error.message : String(error)
    )
  }

  function onRootActivity(): void {
    // Leading-edge scheduling rather than a restarting debounce: a clone writing entries for a
    // minute would keep pushing a restarting timer further out, whereas this guarantees exactly one
    // emission per burst, within SITE_ROOTS_DEBOUNCE_MS of the first event.
    if (stopped || debounceToken !== null) {
      return
    }
    debounceToken = schedule(() => {
      debounceToken = null
      emit('watch')
    }, SITE_ROOTS_DEBOUNCE_MS)
  }

  function closeWatcher(watcher: SiteRootsWatchHandle): void {
    try {
      watcher.close()
    } catch {
      // A watcher whose directory already vanished can throw on close; nothing left to release.
    }
  }

  function closeWatchers(): void {
    for (const watcher of watchers.values()) {
      closeWatcher(watcher)
    }
    watchers.clear()
  }

  function openWatchers(): void {
    for (const root of roots) {
      try {
        const watcher = watch(root, { recursive: false }, onRootActivity)
        watchers.set(root, watcher)
        // An ejected volume or a deleted root reports asynchronously, long after watch() returned.
        watcher.on('error', (error) => {
          noteWatchFailure(root, error)
          if (watchers.get(root) === watcher) {
            watchers.delete(root)
          }
          closeWatcher(watcher)
        })
      } catch (error) {
        // ENOENT/EPERM/a dropped share costs one root, never the watcher and never the app.
        noteWatchFailure(root, error)
      }
    }
  }

  function refreshRoots(): void {
    if (stopped) {
      return
    }
    const next = deriveSiteRoots(store, directoryExists)
    if (siteRootsEqual(roots, next)) {
      return
    }
    roots = next
    // A root that left the set gets a clean slate if it ever returns; the ones that stayed keep
    // their "already reported" mark, so a persistent failure still logs exactly once.
    for (const failed of loggedFailures) {
      if (!next.includes(failed)) {
        loggedFailures.delete(failed)
      }
    }
    closeWatchers()
    openWatchers()
    emit('roots-changed')
  }

  openWatchers()
  sweepToken = scheduleEvery(() => emit('sweep'), SITE_ROOTS_SWEEP_MS)

  return {
    stop: () => {
      if (stopped) {
        return
      }
      stopped = true
      if (debounceToken !== null) {
        unschedule(debounceToken)
        debounceToken = null
      }
      if (sweepToken !== null) {
        unscheduleEvery(sweepToken)
        sweepToken = null
      }
      closeWatchers()
    },
    getRoots: () => [...roots],
    refreshRoots
  }
}
