// IPC surface for the live Sites view: which folders are being watched, what is sitting in them,
// and a push channel for "that answer just went stale".
//
// Follows ipc/site-runs.ts: a removeHandler prologue so a re-register cannot double up, tagged-union
// results instead of exceptions (a throw across the bridge loses its type and its stack), and
// sender.send for the push half, guarded against a destroyed renderer.
//
// The watcher is a singleton. The roots are a property of the store, not of a window, so a second
// window subscribes to the same stream instead of opening a second set of fs.watch handles.

import { app, ipcMain, type WebContents } from 'electron'
import type { SiteDiscoveryResult, SiteRootsChangedEvent } from '../../shared/site-discovery-types'
import type { SiteResult } from '../../shared/site-types'
import type { Store } from '../persistence'
import { discoverSiteCandidates } from '../sites/site-candidate-discovery'
import {
  siteRootsEqual,
  startSiteRootsWatcher,
  type SiteRootsWatcherHandle
} from '../sites/site-roots-watcher'
import { failure } from './sites-result'

const SITE_ROOTS_CHANNELS = ['siteRoots:list', 'siteRoots:discover', 'siteRoots:refresh'] as const

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

  ipcMain.handle('siteRoots:list', (event): SiteResult<string[]> => {
    subscribe(event.sender)
    return { ok: true, value: roots.getRoots() }
  })

  ipcMain.handle('siteRoots:discover', async (event): Promise<SiteResult<SiteDiscoveryResult>> => {
    subscribe(event.sender)
    try {
      return {
        ok: true,
        value: await discoverSiteCandidates({
          roots: roots.getRoots(),
          // The renderer merges discovery against its own site list, so main only has to keep the
          // already-configured checkouts out of the candidate set.
          configuredPaths: store.listSites().map((site) => site.path)
        })
      }
    } catch (error) {
      return failure(error)
    }
  })

  // The window-focus call. Resolves true when the root set itself moved, which is the only case
  // where the caller needs to do more than re-run discovery.
  ipcMain.handle('siteRoots:refresh', (event): SiteResult<boolean> => {
    subscribe(event.sender)
    const before = roots.getRoots()
    roots.refreshRoots()
    const after = roots.getRoots()
    if (siteRootsEqual(before, after)) {
      // refreshRoots stays quiet when the set is identical, but the caller is asking for a re-scan
      // regardless — so nudge the renderer exactly as the safety-net sweep would.
      broadcast({ reason: 'sweep', roots: after, at: Date.now() })
      return { ok: true, value: false }
    }
    return { ok: true, value: true }
  })
}

/**
 * Adds a renderer to the siteRoots:changed stream. The three channels already subscribe their
 * caller, so this is only for a caller that learns about the roots some other way and would
 * otherwise never hear that they moved.
 */
export function subscribeSiteRootsEvents(sender: WebContents): void {
  subscribe(sender)
}
