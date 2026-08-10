// The renderer's view of the live-roots surface. Lives in shared/ (like site-setup-api-types.ts)
// because the preload type surface is compiled into the browser project and must not reach into
// main, where the watcher and the scanner actually live.

import type {
  SiteDiscoveryResult,
  SiteRootEntry,
  SiteRootsChangedEvent
} from './site-discovery-types'
import type { SiteResult } from './site-types'

export type SiteRootsApi = {
  /** The roots in effect, in scan order: the configured list, or the derived set when it is empty. */
  list: () => Promise<SiteResult<string[]>>
  /**
   * Where a new checkout should land. Not `list()[0]`: the derived set renders in a stable
   * alphabetical order, so its first entry is whichever path sorts first rather than the folder
   * that actually holds the user's projects. Empty when there is no usable root, which the caller
   * must treat as "ask, do not guess".
   */
  primary: () => Promise<SiteResult<string>>

  /**
   * The folder list the user manages, in their order, unreachable entries included and flagged.
   * Empty means nothing is configured and `list` is reporting derived roots.
   */
  configured: () => Promise<SiteResult<SiteRootEntry[]>>
  /** What is on disk in those roots right now, minus the folders that already have a Site. */
  discover: () => Promise<SiteResult<SiteDiscoveryResult>>
  /**
   * Forces a re-resolve and always pushes a `siteRoots:changed`, so a window-focus handler can call
   * this and then react to the event rather than branching on the result. Resolves true only when
   * the root set itself moved.
   */
  refresh: () => Promise<SiteResult<boolean>>
  /**
   * Appends a folder. Fails when the path does not exist, is not a directory, is already listed,
   * or the list is full. Resolves the new list, so the caller need not re-read.
   */
  add: (path: string) => Promise<SiteResult<SiteRootEntry[]>>
  /** Removes by path, including an unreachable one. Removing the last entry is allowed. */
  remove: (path: string) => Promise<SiteResult<SiteRootEntry[]>>
  /** Moves one entry to a position; `toIndex` is clamped into the list. */
  reorder: (args: { path: string; toIndex: number }) => Promise<SiteResult<SiteRootEntry[]>>
  /** Returns an unsubscribe. */
  onChanged: (callback: (event: SiteRootsChangedEvent) => void) => () => void
}
