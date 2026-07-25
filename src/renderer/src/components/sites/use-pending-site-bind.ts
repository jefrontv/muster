// Collects the pending `muster://` bind request from main.
//
// Two paths, because a link can arrive at any time: `pending()` on mount catches a link that opened
// the app, and `onRequest` catches every later one. The same call subscribes this renderer, so a
// remounted dialog keeps receiving.

import { useCallback, useEffect, useState } from 'react'
import type {
  PendingSiteBind,
  SiteBindApi,
  SiteBitbucketApi
} from '../../../../shared/site-bind-types'

// Still nullable: the web client serves a Partial<PreloadApi>, so a bridge can be absent there.
export function siteBindApi(): SiteBindApi | null {
  return window.api.siteBind ?? null
}

export function siteBitbucketApi(): SiteBitbucketApi | null {
  return window.api.siteBitbucket ?? null
}

export type PendingSiteBindState = {
  pending: PendingSiteBind | null
  dismiss: () => void
  clear: () => void
}

export function usePendingSiteBind(): PendingSiteBindState {
  const [pending, setPending] = useState<PendingSiteBind | null>(null)

  useEffect(() => {
    const api = siteBindApi()
    if (!api) {
      return
    }
    let active = true
    void api.pending().then((result) => {
      if (active && result.ok && result.value) {
        setPending(result.value)
      }
    })
    const unsubscribe = api.onRequest((next) => setPending(next))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const dismiss = useCallback(() => {
    const requestId = pending?.requestId
    setPending(null)
    if (requestId) {
      void siteBindApi()?.dismiss(requestId)
    }
  }, [pending?.requestId])

  return { pending, dismiss, clear: useCallback(() => setPending(null), []) }
}
