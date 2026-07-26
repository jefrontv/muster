// Keeps the site and project lists honest about what is actually on disk.
//
// Muster used to discover folders only when you opened the Add Project dialog, so a project
// cloned, moved, or deleted outside the app stayed wrong until you happened to take an action.
// Main now watches the derived roots (depth-1) and pushes `siteRoots:changed`; this hook is the
// renderer half.
//
// Three triggers, because no single one is reliable on its own:
//   - the watcher event, which is instant but can silently stop on network volumes
//   - window focus, which covers "I just did something in Finder and came back"
//   - main's periodic sweep, which arrives as the same event and backstops both
//
// Refetches are coalesced: several triggers can land together (focus + the watch event that the
// same Finder action produced), and two overlapping refetches would just race each other.

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'

/** Long enough to swallow a focus+watch pair, short enough to feel immediate. */
const COALESCE_MS = 250

export function useSiteRootsRefresh(): void {
  const fetchSites = useAppStore((state) => state.fetchSites)
  const fetchRepos = useAppStore((state) => state.fetchRepos)
  // Why refs: the effect must not re-subscribe every time the store hands back a new function
  // identity, or a re-render would tear down and rebuild the watcher subscription.
  const fetchSitesRef = useRef(fetchSites)
  const fetchReposRef = useRef(fetchRepos)
  fetchSitesRef.current = fetchSites
  fetchReposRef.current = fetchRepos

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let running = false
    let queued = false

    const run = async (): Promise<void> => {
      if (running) {
        // A trigger during a refetch must not be dropped: the change it reported may postdate the
        // read already in flight.
        queued = true
        return
      }
      running = true
      try {
        await Promise.allSettled([fetchSitesRef.current(), fetchReposRef.current()])
      } finally {
        running = false
        if (queued && !disposed) {
          queued = false
          void run()
        }
      }
    }

    const schedule = (): void => {
      if (disposed || timer) {
        return
      }
      timer = setTimeout(() => {
        timer = null
        void run()
      }, COALESCE_MS)
    }

    const onFocus = (): void => schedule()
    window.addEventListener('focus', onFocus)
    const unsubscribe = window.api.siteRoots?.onChanged(() => schedule())

    return () => {
      disposed = true
      clearTimeout(timer ?? undefined)
      window.removeEventListener('focus', onFocus)
      unsubscribe?.()
    }
  }, [])
}
