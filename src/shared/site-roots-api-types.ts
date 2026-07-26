// The renderer's view of the live-roots surface. Lives in shared/ (like site-setup-api-types.ts)
// because the preload type surface is compiled into the browser project and must not reach into
// main, where the watcher and the scanner actually live.

import type { SiteDiscoveryResult, SiteRootsChangedEvent } from './site-discovery-types'
import type { SiteResult } from './site-types'

export type SiteRootsApi = {
  /** The parent directories currently being watched, in stable order. */
  list: () => Promise<SiteResult<string[]>>
  /** What is on disk in those roots right now, minus the folders that already have a Site. */
  discover: () => Promise<SiteResult<SiteDiscoveryResult>>
  /**
   * Forces a re-derive and always pushes a `siteRoots:changed`, so a window-focus handler can call
   * this and then react to the event rather than branching on the result. Resolves true only when
   * the root set itself moved.
   */
  refresh: () => Promise<SiteResult<boolean>>
  /** Returns an unsubscribe. */
  onChanged: (callback: (event: SiteRootsChangedEvent) => void) => () => void
}
