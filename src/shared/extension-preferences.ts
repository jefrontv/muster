// The two pieces of Extension Hub state that live in settings, and the rules for changing them.
//
// These are written by the RENDERER through its own settings store. Writing them from the main
// process left the renderer's copy stale, which showed up as a switch that snapped back and an
// update card that would not go away.

import type { GlobalSettings } from './types'

export type ExtensionAutoUpdatePreferences = {
  master: boolean
  entries: Record<string, boolean>
}

/** Dismissals would grow without limit otherwise; a few hundred is far past any real need. */
export const MAX_EXTENSION_DISMISSALS = 200

export function readExtensionAutoUpdate(
  settings: Pick<GlobalSettings, 'extensionAutoUpdate'> | null | undefined
): ExtensionAutoUpdatePreferences {
  return settings?.extensionAutoUpdate ?? { master: false, entries: {} }
}

export function setExtensionAutoUpdateMaster(
  current: ExtensionAutoUpdatePreferences,
  master: boolean
): ExtensionAutoUpdatePreferences {
  // Why entries survive: the master switch is a default for entries with no explicit choice, so
  // flipping it must not overwrite the choices someone has already made.
  return { ...current, master }
}

export function setExtensionAutoUpdateEntry(
  current: ExtensionAutoUpdatePreferences,
  id: string,
  enabled: boolean
): ExtensionAutoUpdatePreferences {
  return { ...current, entries: { ...current.entries, [id]: enabled } }
}

/**
 * Newest first, then truncated: an old dismissal expiring is harmless, because the card simply
 * asks once more. Dropping a new one would make it reappear immediately.
 */
export function mergeExtensionDismissals(
  existing: readonly string[] | undefined,
  keys: readonly string[]
): string[] {
  return [...new Set([...keys, ...(existing ?? [])])].slice(0, MAX_EXTENSION_DISMISSALS)
}
