// Shared helpers for the sites IPC surface. Handlers never throw across the bridge — they return
// a tagged union so the renderer branches instead of catching, matching the house pattern
// (src/main/ipc/ephemeral-vm.ts). The result type itself lives in shared/ because the preload
// type surface is compiled into the browser project and must not reach into main.

import type { Site, SiteResult } from '../../shared/site-types'
import type { Store } from '../persistence'

export type { SiteResult }

export function failure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

export function requireSite(store: Store, siteId: string): Site {
  const site = store.getSite(siteId)
  if (!site) {
    throw new Error(`Unknown site: ${siteId}`)
  }
  return site
}
