// What Muster found on this machine for each catalog entry. Separate from the catalog types
// because the catalog is data we publish and this is data we observe — mixing them would let a
// published field look like a measured one.

import type { ExtensionEntry, ExtensionHarnessId } from './extension-catalog-types'

export type ExtensionStatus =
  | 'not-installed'
  | 'current'
  | 'outdated'
  /** Installed, but no version could be read on either side, so "newer?" has no honest answer. */
  | 'unknown'
  | 'unsupported-platform'
  | 'no-access'

export type ExtensionHarnessState = {
  id: ExtensionHarnessId
  label: string
  configPath: string
  /** The harness itself looks installed for this user, entry or not. */
  present: boolean
  configured: boolean
  /** The stored entry already matches what Muster would write now. */
  current: boolean
  error?: string
}

export type ExtensionState = {
  id: string
  installed: boolean
  installedVersion: string | null
  latestVersion: string | null
  status: ExtensionStatus
  /** Why a status is what it is, when the status alone would leave the user guessing. */
  detail?: string
  /** Resolved absolute path, which Codex needs because it does not search PATH. */
  binaryPath: string | null
  harnesses: ExtensionHarnessState[]
  autoUpdateSupported: boolean
  autoUpdateEnabled: boolean
  /** Undefined when the entry is public or the probe has not run. */
  accessGranted?: boolean
  /** Where a locally discovered skill actually lives, for entries Muster did not publish. */
  origin?: { label: string; path: string; providers: string[] }
  /**
   * A harness already points at this server, but not at the copy Muster would install — a local
   * checkout, a hand-written entry, an older global install. Installing takes it over.
   */
  externallyManaged?: boolean
}

/**
 * The harness rows worth putting in front of someone.
 *
 * An agent this machine does not have is noise: the user cannot act on it, and a list of six rows
 * where two are real buries the two. A row still shows when it is configured despite looking
 * absent, because an entry that exists is one they may want to remove.
 */
export function visibleExtensionHarnesses(
  harnesses: readonly ExtensionHarnessState[]
): ExtensionHarnessState[] {
  return harnesses.filter((harness) => harness.present || harness.configured)
}

export type ExtensionInventoryEntry = {
  entry: ExtensionEntry
  state: ExtensionState
}

export type ExtensionInventory = {
  schemaVersion: 1
  entries: ExtensionInventoryEntry[]
  catalogOrigin: 'remote' | 'cache' | 'bundled'
  catalogUpdatedAt: string
  scannedAt: number
  /** A failed catalog refresh. The inventory is still usable; the pane says it may be stale. */
  catalogError?: string
}

export function countExtensionUpdates(inventory: ExtensionInventory | null): number {
  return (inventory?.entries ?? []).filter(({ state }) => state.status === 'outdated').length
}

/**
 * The entries a launch-time auto-update pass may touch. Deliberately narrow: anything without a
 * readable installed version, without access, or off the user's platform is left alone rather than
 * "repaired" into a state nobody asked for.
 */
export function eligibleExtensionAutoUpdates(
  inventory: ExtensionInventory | null
): ExtensionInventoryEntry[] {
  return (inventory?.entries ?? []).filter(
    ({ state }) =>
      state.status === 'outdated' &&
      state.autoUpdateSupported &&
      state.autoUpdateEnabled &&
      state.accessGranted !== false
  )
}
