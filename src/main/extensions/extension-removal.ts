// Turning an extension off, and taking it off the machine.
//
// Two different acts, kept apart on purpose. Disabling withdraws the harness entries and leaves the
// program where it is, so turning it back on is one click and costs nothing. Uninstalling runs the
// catalog's removal command as well, and there is no undo for that beyond installing again.
//
// A locally discovered skill is a third case: Muster did not put it there, so it goes to the
// trash rather than being deleted outright, and only when it sits under a root Muster scans.

import { shell } from 'electron'
import { dirname } from 'node:path'
import type { Store } from '../persistence'
import type { ExtensionEntry } from '../../shared/extension-catalog-types'
import { readExtensionInventory } from './extension-service'
import { installExtensionHarness } from './extension-service'
import { uninstallExtensionMcpHarness } from './mcp-entry-adapters'
import { extensionCommandSpec } from '../../shared/extension-command-resolution'

export type ExtensionRemovalOutcome = {
  harnessesCleared: number
  /** Null when the catalog offers no removal command, or the entry has no program of its own. */
  command: string | null
}

function requireEntry(
  entries: readonly { entry: ExtensionEntry }[],
  id: string
): ExtensionEntry {
  const found = entries.find(({ entry }) => entry.id === id)?.entry
  if (!found) {
    throw new Error('That extension is not in the catalog.')
  }
  return found
}

/**
 * Writes or withdraws this extension's entry in every harness it declares.
 *
 * Enabling re-probes the binary through `installExtensionHarness`, so a program that moved since
 * the last scan is written at its current path rather than the stale one.
 */
export async function setExtensionEnabled(
  store: Store,
  id: string,
  enabled: boolean
): Promise<number> {
  const inventory = await readExtensionInventory(store)
  const entry = requireEntry(inventory.entries, id)
  if (entry.install.method !== 'config-write') {
    throw new Error('That extension does not register an MCP server.')
  }
  const server = entry.install.server
  const states = inventory.entries.find(({ entry: found }) => found.id === id)?.state.harnesses ?? []
  const absent = new Set(
    states.filter((harness) => !harness.present).map((harness) => harness.id)
  )
  let changed = 0
  for (const harness of server.harnesses) {
    // Why absent agents are skipped on the way in but not on the way out: writing config for an
    // agent the user does not have invents a file nothing will read, while clearing one that
    // somehow exists is always the right answer.
    if (enabled && absent.has(harness.id)) {
      continue
    }
    if (enabled) {
      installExtensionHarness(store, entry, harness.id)
    } else {
      uninstallExtensionMcpHarness(server, harness.id)
    }
    changed += 1
  }
  return changed
}

/**
 * Clears every harness entry, and reports the removal command for the caller to stream.
 *
 * The config entries go first on purpose: if the command then fails, the user is left with nothing
 * pointing at a half-removed program, which is the safer of the two half-states.
 */
export async function prepareExtensionUninstall(
  store: Store,
  id: string
): Promise<ExtensionRemovalOutcome> {
  const inventory = await readExtensionInventory(store)
  const entry = requireEntry(inventory.entries, id)
  let harnessesCleared = 0
  if (entry.install.method === 'config-write') {
    for (const harness of entry.install.server.harnesses) {
      uninstallExtensionMcpHarness(entry.install.server, harness.id)
      harnessesCleared += 1
    }
  }
  return { harnessesCleared, command: extensionCommandSpec(entry)?.uninstall ?? null }
}

/**
 * Sends a discovered skill's folder to the trash.
 *
 * Trash rather than unlink because this is the user's own file, put there by something that is not
 * Muster, and a mistaken click should be recoverable from Finder rather than from a backup.
 */
export async function trashDiscoveredSkill(
  store: Store,
  id: string
): Promise<string> {
  const inventory = await readExtensionInventory(store)
  const item = inventory.entries.find(({ entry }) => entry.id === id)
  const path = item?.state.origin?.path
  if (!path) {
    throw new Error('Muster does not know where that skill lives, so it will not remove it.')
  }
  // The origin path is the SKILL.md itself; the folder around it is the package.
  const directory = dirname(path)
  await shell.trashItem(directory)
  return directory
}
