// Live local-stack status for one site, shared by every card showing it.
//
// The sidebar and the Sites page can show the same site at once; each asking `detect` on its own
// doubled a `ddev describe` every tick. One registry entry per site serves all of them, polls
// only while someone is subscribed and the window is visible and focused, and never overlaps
// requests. A transition (starting/stopping) holds until a poll confirms the new state.

import { useCallback, useSyncExternalStore } from 'react'
import type { LocalWpStackDetection } from '../../../../shared/site-stack-types'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'

export const SITE_STACK_POLL_INTERVAL_MS = 5_000

export type SiteStackTransition = 'starting' | 'stopping' | null

export type SiteStackStatus = {
  detection: LocalWpStackDetection | null
  transition: SiteStackTransition
}

type Entry = {
  status: SiteStackStatus
  listeners: Set<() => void>
  inFlight: boolean
  queued: boolean
  stopPolling: (() => void) | null
}

const EMPTY: SiteStackStatus = { detection: null, transition: null }
const entries = new Map<string, Entry>()

function entryFor(siteId: string): Entry {
  let entry = entries.get(siteId)
  if (!entry) {
    entry = {
      status: EMPTY,
      listeners: new Set(),
      inFlight: false,
      queued: false,
      stopPolling: null
    }
    entries.set(siteId, entry)
  }
  return entry
}

function publish(entry: Entry, next: SiteStackStatus): void {
  entry.status = next
  for (const listener of entry.listeners) {
    listener()
  }
}

function transitionSettled(
  transition: SiteStackTransition,
  detection: LocalWpStackDetection
): boolean {
  if (transition === 'starting') {
    return detection.socketReady
  }
  if (transition === 'stopping') {
    return !detection.socketReady
  }
  return true
}

/** Asks main once; a trigger during a request is queued rather than dropped or doubled. */
export async function refreshSiteStackStatus(siteId: string): Promise<void> {
  const entry = entryFor(siteId)
  if (entry.inFlight) {
    entry.queued = true
    return
  }
  entry.inFlight = true
  try {
    const answer = await window.api.siteStacks.detect(siteId)
    if (answer?.ok) {
      const transition = transitionSettled(entry.status.transition, answer.value)
        ? null
        : entry.status.transition
      publish(entry, { detection: answer.value, transition })
    }
  } finally {
    entry.inFlight = false
    if (entry.queued) {
      entry.queued = false
      void refreshSiteStackStatus(siteId)
    }
  }
}

export function readSiteStackStatus(siteId: string): SiteStackStatus {
  return entryFor(siteId).status
}

export function setSiteStackTransition(siteId: string, transition: SiteStackTransition): void {
  const entry = entryFor(siteId)
  publish(entry, { ...entry.status, transition })
}

function hasFocus(): boolean {
  return (
    typeof document === 'undefined' ||
    typeof document.hasFocus !== 'function' ||
    document.hasFocus()
  )
}

function subscribe(siteId: string, listener: () => void): () => void {
  const entry = entryFor(siteId)
  entry.listeners.add(listener)
  if (entry.listeners.size === 1) {
    const onFocus = (): void => void refreshSiteStackStatus(siteId)
    window.addEventListener('focus', onFocus)
    // The helper runs once on install, which is the mount refresh.
    const stopInterval = installWindowVisibilityInterval({
      run: () => {
        // The first answer loads regardless: a card mounted in an unfocused window stayed empty.
        if (hasFocus() || entry.status.detection === null) {
          void refreshSiteStackStatus(siteId)
        }
      },
      runOnVisible: () => void refreshSiteStackStatus(siteId),
      intervalMs: SITE_STACK_POLL_INTERVAL_MS
    })
    // A record change (setup, adopt, a run) can change what the stack reports.
    const stopChanges = window.api.sites?.onChanged?.((changedId) => {
      if (changedId === siteId) {
        void refreshSiteStackStatus(siteId)
      }
    })
    entry.stopPolling = () => {
      window.removeEventListener('focus', onFocus)
      stopInterval()
      stopChanges?.()
    }
  }
  return () => {
    entry.listeners.delete(listener)
    if (entry.listeners.size === 0) {
      entry.stopPolling?.()
      entry.stopPolling = null
    }
  }
}

export function useSiteStackStatus(siteId: string): SiteStackStatus & {
  refresh: () => Promise<void>
  setTransition: (transition: SiteStackTransition) => void
} {
  const status = useSyncExternalStore(
    useCallback((listener) => subscribe(siteId, listener), [siteId]),
    () => readSiteStackStatus(siteId)
  )
  const refresh = useCallback(() => refreshSiteStackStatus(siteId), [siteId])
  const setTransition = useCallback(
    (transition: SiteStackTransition) => setSiteStackTransition(siteId, transition),
    [siteId]
  )
  return { ...status, refresh, setTransition }
}

/** Test seam: forget every site's cached status and stop their polls. */
export function resetSiteStackStatusForTests(): void {
  for (const entry of entries.values()) {
    entry.stopPolling?.()
  }
  entries.clear()
}
