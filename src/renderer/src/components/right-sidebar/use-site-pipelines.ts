// Polls Bitbucket Pipelines runs for the site the panel is showing.
//
// Cadence is deliberately far slower than the local run poll next door (2.5s). That one reads a
// local store; this one spends a Bitbucket API call, and the account is capped at roughly 1000
// requests an hour across everything Muster does. One visible site at 60s costs 60/hour.
//
// Same visibility discipline as the run poll: the timer is torn down while the document is hidden
// rather than firing into a no-op, with an immediate read on reveal so a build that finished while
// the window was away shows its result straight away.

import { useEffect, useState } from 'react'
import type { SitePipelinesResult } from '../../../../shared/site-types'

const POLL_MS = 60_000

export function useSitePipelines(siteId: string | null): SitePipelinesResult | null {
  const [result, setResult] = useState<SitePipelinesResult | null>(null)

  useEffect(() => {
    if (!siteId) {
      setResult(null)
      return
    }
    // Cleared on site change so the previous site's badge cannot linger over the new one.
    setResult(null)
    let cancelled = false

    const read = async (): Promise<void> => {
      const response = await window.api.sites?.pipelines(siteId)
      if (cancelled || !response) {
        return
      }
      // A failed call leaves the last good value in place: a flaky network should not blank a
      // status the user was already reading.
      if (response.ok) {
        setResult(response.value)
      }
    }

    let interval: number | null = null
    const reconcile = (): void => {
      if (document.visibilityState === 'visible') {
        if (interval === null) {
          interval = window.setInterval(() => void read(), POLL_MS)
          void read()
        }
        return
      }
      if (interval !== null) {
        window.clearInterval(interval)
        interval = null
      }
    }
    reconcile()
    document.addEventListener('visibilitychange', reconcile)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', reconcile)
      if (interval !== null) {
        window.clearInterval(interval)
      }
    }
  }, [siteId])

  return result
}
