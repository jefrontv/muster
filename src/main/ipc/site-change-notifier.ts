// Tells the window a site record changed in main, so a write made outside the renderer (stack
// setup, adoption, a run) reaches the sidebar without waiting for an unrelated refetch.

import { sendToTrustedUIRenderer } from './ui'

export function notifySiteChanged(siteId: string): void {
  sendToTrustedUIRenderer('sites:changed', siteId)
}
