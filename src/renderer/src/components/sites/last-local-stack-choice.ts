// Which stack the user last actually set a site up with, so the next setup opens on it.
//
// Written only after a migration succeeds, not on every click: this is meant to remember a decision
// the user carried through, not one they hovered over and changed their mind about.
//
// localStorage rather than the Site record — it is a UI default that spans sites, and a machine
// where the stack was uninstalled must fall back rather than propose something that cannot run.

import type { SiteLocalStack } from '../../../../shared/site-types'

const STORAGE_KEY = 'muster.sites.lastLocalStackChoice'

const REMEMBERABLE: SiteLocalStack[] = ['localwp', 'agent-local']

export function readLastLocalStackChoice(): SiteLocalStack | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return REMEMBERABLE.includes(stored as SiteLocalStack) ? (stored as SiteLocalStack) : null
  } catch {
    // A blocked or full localStorage costs the default, never the setup.
    return null
  }
}

export function rememberLocalStackChoice(stack: SiteLocalStack): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, stack)
  } catch {
    // As above: losing the preference is not worth failing a migration that already succeeded.
  }
}
