// IPC surface for the live Sites view: which folders sites are sourced from, what is sitting in
// them, and a push channel for "that answer just went stale".
//
// Follows ipc/site-runs.ts: a removeHandler prologue so a re-register cannot double up, tagged-union
// results instead of exceptions (a throw across the bridge loses its type and its stack), and
// sender.send for the push half, guarded against a destroyed renderer.
//
// The watcher is a singleton. The roots are a property of the store, not of a window, so a second
// window subscribes to the same stream instead of opening a second set of fs.watch handles.
//
// The three writers are deltas (add / remove / reorder), not one set-roots call. A whole-list write
// makes the renderer the authority on a list two windows can edit: a renderer that missed a
// `siteRoots:changed` would silently drop the root the other window just added. A delta touches one
// entry and is keyed on its path, so a stale view costs that one operation. It also lets a
// rejection name a reason for a specific path ("Not a folder: …") instead of reporting which of N
// entries a bulk write refused.

import { app, ipcMain, type WebContents } from 'electron'
import type {
  SiteDiscoveryResult,
  SiteRootEntry,
  SiteRootsChangedEvent
} from '../../shared/site-discovery-types'
import type { SiteResult } from '../../shared/site-types'
import type { Store } from '../persistence'
import { discoverSiteCandidates } from '../sites/site-candidate-discovery'
import {
  addConfiguredSiteRoot,
  describeConfiguredSiteRoots,
  removeConfiguredSiteRoot,
  reorderConfiguredSiteRoot
} from '../sites/site-roots-config'
import {
  derivePrimarySiteRoot,
  siteRootsEqual,
  startSiteRootsWatcher,
  type SiteRootsWatcherHandle
} from '../sites/site-roots-watcher'
import { failure } from './sites-result'

const SITE_ROOTS_CHANNELS = [
  'siteRoots:list',
  'siteRoots:primary',
  'siteRoots:configured',
  'siteRoots:discover',
  'siteRoots:refresh',
  'siteRoots:add',
  'siteRoots:remove',
  'siteRoots:reorder'
] as const

const EVENT_CHANNEL = 'siteRoots:changed'

const subscribers = new Set<WebContents>()

let watcher: SiteRootsWatcherHandle | null = null
let quitHookInstalled = false

function broadcast(event: SiteRootsChangedEvent): void {
  for (const sender of subscribers) {
    if (sender.isDestroyed()) {
      subscribers.delete(sender)
      continue
    }
    sender.send(EVENT_CHANNEL, event)
  }
}

function subscribe(sender: WebContents): void {
  if (subscribers.has(sender)) {
    return
  }
  subscribers.add(sender)
  // Every channel subscribes its caller, so without this a reloading renderer would add a dead
  // WebContents per reload and the set would only ever be pruned on the next broadcast.
  sender.once('destroyed', () => subscribers.delete(sender))
}

export function registerSiteRootsHandlers(store: Store): void {
  for (const channel of SITE_ROOTS_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  // A subscriber belongs to a registration, exactly as it does in the closure-scoped set in
  // site-runs.ts: the watcher below replaces the one those renderers were listening to.
  subscribers.clear()

  // Started here rather than at module load so the store is available, and replaced on a
  // re-register so the previous watcher's fs.watch handles and sweep timer do not outlive it.
  watcher?.stop()
  const roots = startSiteRootsWatcher(store, { onChange: broadcast })
  watcher = roots

  if (!quitHookInstalled) {
    quitHookInstalled = true
    // Reads the module binding, not `roots`: a re-register must not leave the quit hook holding a
    // watcher that has already been stopped and replaced.
    app.once('will-quit', () => {
      watcher?.stop()
      watcher = null
    })
  }

  // The roots actually in effect: the configured list, or the derived set when none is configured.
  ipcMain.handle('siteRoots:list', (event): SiteResult<string[]> => {
    subscribe(event.sender)
    return { ok: true, value: roots.getRoots() }
  })

  /**
   * The single folder a new checkout should land in.
   *
   * Deliberately not `list()[0]`: the derived set is rendered in a stable alphabetical order, so
   * its first entry is whichever path sorts first, not the folder holding the most projects. That
   * is how a private application directory came to be offered as the clone destination for a user
   * whose projects all live somewhere else.
   */
  ipcMain.handle('siteRoots:primary', (event): SiteResult<string> => {
    subscribe(event.sender)
    return { ok: true, value: derivePrimarySiteRoot(store) }
  })

  ipcMain.handle('siteRoots:discover', async (event): Promise<SiteResult<SiteDiscoveryResult>> => {
    subscribe(event.sender)
    try {
      return {
        ok: true,
        value: await discoverSiteCandidates({
          roots: roots.getRoots(),
          // Resolved separately: `getRoots()` reports the whole scanned set in render order, which
          // is not the one reachable folder the renderer needs as a clone destination.
          primaryRoot: derivePrimarySiteRoot(store),
          // The renderer merges discovery against its own site list, so main only has to keep the
          // already-configured checkouts out of the candidate set.
          configuredPaths: store.listSites().map((site) => site.path)
        })
      }
    } catch (error) {
      return failure(error)
    }
  })

  // Re-resolves the watched set and always pushes, so a caller can react to the event rather than
  // branching on the result. Resolves true only when the set itself moved.
  function republishRoots(): boolean {
    const before = roots.getRoots()
    roots.refreshRoots()
    const after = roots.getRoots()
    if (siteRootsEqual(before, after)) {
      // refreshRoots stays quiet when the set is identical, but the caller is asking for a re-scan
      // regardless — so nudge the renderer exactly as the safety-net sweep would.
      broadcast({ reason: 'sweep', roots: after, at: Date.now() })
      return false
    }
    return true
  }

  // The window-focus call.
  ipcMain.handle('siteRoots:refresh', (event): SiteResult<boolean> => {
    subscribe(event.sender)
    return { ok: true, value: republishRoots() }
  })

  // The folder list as the user manages it, unreachable entries included and marked. Distinct from
  // `siteRoots:list`, which reports the roots actually in effect — the derived set when this is
  // empty.
  ipcMain.handle('siteRoots:configured', (event): SiteResult<SiteRootEntry[]> => {
    subscribe(event.sender)
    return { ok: true, value: describeConfiguredSiteRoots(store) }
  })

  // Each writer returns the new list so the caller renders from the write it just made instead of
  // racing its own `siteRoots:changed`. Arguments are shape-checked first, as in site-runs.ts: the
  // config module's messages name a path, which reads as nonsense for a malformed call.
  ipcMain.handle('siteRoots:add', (event, path: unknown): SiteResult<SiteRootEntry[]> => {
    subscribe(event.sender)
    if (typeof path !== 'string') {
      return { ok: false, error: 'Invalid folder path.' }
    }
    try {
      const entries = addConfiguredSiteRoot(store, path)
      republishRoots()
      return { ok: true, value: entries }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle('siteRoots:remove', (event, path: unknown): SiteResult<SiteRootEntry[]> => {
    subscribe(event.sender)
    if (typeof path !== 'string') {
      return { ok: false, error: 'Invalid folder path.' }
    }
    try {
      const entries = removeConfiguredSiteRoot(store, path)
      republishRoots()
      return { ok: true, value: entries }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle('siteRoots:reorder', (event, args: unknown): SiteResult<SiteRootEntry[]> => {
    subscribe(event.sender)
    const { path, toIndex } = (args ?? {}) as { path?: unknown; toIndex?: unknown }
    if (typeof path !== 'string' || typeof toIndex !== 'number') {
      return { ok: false, error: 'Invalid reorder request.' }
    }
    try {
      const entries = reorderConfiguredSiteRoot(store, path, toIndex)
      republishRoots()
      return { ok: true, value: entries }
    } catch (error) {
      return failure(error)
    }
  })
}

/**
 * Adds a renderer to the siteRoots:changed stream. Every channel already subscribes its caller, so
 * this is only for a caller that learns about the roots some other way and would otherwise never
 * hear that they moved.
 */
export function subscribeSiteRootsEvents(sender: WebContents): void {
  subscribe(sender)
}
