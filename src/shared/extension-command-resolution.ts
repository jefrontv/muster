// Which command an entry's button should run, and what to call the button.
//
// Shared rather than main-only because the card must SHOW the exact command before the user agrees
// to it, and the confirm dialog must name the same string the terminal receives. Two
// implementations of this would eventually disagree, and the one place they must not disagree is
// the text a user reads before authorising something to run on their machine.

import type { ExtensionCommandSpec, ExtensionEntry } from './extension-catalog-types'
import type { ExtensionState } from './extension-state-types'
import { homebrewUpgradeCommand } from './homebrew-owned-binary'

export type ExtensionCommandAction = {
  kind: 'install' | 'update'
  command: string
}

export function extensionCommandSpec(entry: ExtensionEntry): ExtensionCommandSpec | null {
  if (entry.install.method === 'command') {
    return entry.install.command
  }
  if (entry.install.method === 'config-write') {
    return entry.install.provision ?? null
  }
  return null
}

/**
 * Null means there is nothing to run: either the entry needs no command, or it needs one the
 * catalog does not carry. Agent Local is the second case — it updates itself but has no in-app
 * first-install route — and the card shows its homepage instead of a button that lies.
 */
export function resolveExtensionCommand(
  entry: ExtensionEntry,
  state: ExtensionState
): ExtensionCommandAction | null {
  const spec = extensionCommandSpec(entry)
  if (!spec) {
    return null
  }
  // Why externallyManaged takes the install branch: the managed copy is not there yet, so this is a
  // first install that happens to be replacing someone else's wiring, not an upgrade of ours.
  if (!state.installed || state.externallyManaged === true) {
    return spec.install ? { kind: 'install', command: spec.install } : null
  }
  // Homebrew owns the program, so the catalog's own update command cannot do the job: a tool that
  // self-updates refuses when a package manager installed it, prints the brew line and exits, and
  // the hub read that refusal as a failed update with no way forward.
  if (state.homebrewFormula) {
    return { kind: 'update', command: homebrewUpgradeCommand(state.homebrewFormula) }
  }
  const update = spec.update ?? spec.install
  return update ? { kind: 'update', command: update } : null
}

/** The command that removes an entry's program, when the catalog offers one. */
export function extensionUninstallCommand(entry: ExtensionEntry): string | null {
  return extensionCommandSpec(entry)?.uninstall ?? null
}

/**
 * An MCP entry is "on" when at least one harness knows about it. Derived rather than stored,
 * because the harness configs are the truth and a stored flag would drift from a hand edit.
 */
export function isExtensionEnabled(state: ExtensionState): boolean {
  return state.harnesses.some((harness) => harness.configured)
}

/**
 * Harness rows Muster could write but has not, or has written with something now stale.
 *
 * Only agents this machine actually has. An agent the user does not run is not something to fix,
 * and counting it would report work outstanding that nobody can or should do.
 */
export function harnessesNeedingSetup(state: ExtensionState): number {
  return state.harnesses.filter(
    (harness) => harness.present && (!harness.configured || !harness.current)
  ).length
}

/**
 * Whether the card should offer to wire harnesses at all. A stdio server whose binary is missing
 * cannot be wired yet, and offering it would produce an error the user cannot act on.
 */
export function canWireHarnesses(entry: ExtensionEntry, state: ExtensionState): boolean {
  if (entry.install.method !== 'config-write') {
    return false
  }
  // Why an externally managed entry still shows its rows: those rows are how the user sees what
  // their agent is currently pointed at, and hiding them because Muster did not write them left
  // someone with a working server staring at an empty dialog.
  return entry.install.provision === undefined || state.installed || isExtensionEnabled(state)
}
