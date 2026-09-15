// Which local stacks this machine can run, re-read while it matters.
//
// The probe asks each stack its own question, so it goes stale the moment the user installs
// something in Terminal and comes back. Asking once at mount left a freshly installed stack
// invisible for as long as the panel stayed mounted — and the setup step hides its whole chooser
// when only one stack is available, so "stale" and "not installed" looked identical.
//
// Three triggers, because no single one is reliable on its own:
//   - the visibility primitive's first run, so the first paint is not blank
//   - window focus, which covers "I just installed it and came back"
//   - the visible-window interval, for a second display and for anything that lands while the
//     window already has focus

import { useEffect, useState } from 'react'
import type { SiteLocalStack } from '../../../shared/site-types'
import { installWindowVisibilityInterval } from './window-visibility-interval'

/** The trigger is a person installing software; a slow poll still catches it and costs nothing. */
const POLL_INTERVAL_MS = 30_000

export function useAvailableSiteStacks(): SiteLocalStack[] | null {
  const [stacks, setStacks] = useState<SiteLocalStack[] | null>(null)

  useEffect(() => {
    let disposed = false
    let running = false
    let queued = false

    const probe = (): void => {
      void (async () => {
        if (running) {
          // A trigger during a probe must not be dropped: the install it reported may postdate the
          // read already in flight.
          queued = true
          return
        }
        running = true
        try {
          // The web client has no siteStacks bridge: its fallback proxy is only special-cased for
          // names like `detect*` and `is*`, so `available()` resolves `undefined` rather than a
          // result. Anything that is not an ok answer counts as a failed probe.
          const answer: { ok?: boolean; value?: SiteLocalStack[] } | undefined =
            await window.api.siteStacks.available()
          if (!disposed) {
            // A failed probe keeps the last good answer: one transient error must not empty the
            // chooser the user is looking at. A first-probe failure answers [], which is what the
            // setup review seeds from when it finds no stack installed.
            setStacks((previous) => (answer?.ok && answer.value ? answer.value : (previous ?? [])))
          }
        } finally {
          running = false
          if (queued && !disposed) {
            queued = false
            probe()
          }
        }
      })()
    }

    window.addEventListener('focus', probe)
    // Runs once on install and again on becoming visible, so this is also the mount probe.
    const stopPolling = installWindowVisibilityInterval({
      run: probe,
      intervalMs: POLL_INTERVAL_MS
    })

    return () => {
      disposed = true
      window.removeEventListener('focus', probe)
      stopPolling()
    }
  }, [])

  return stacks
}
