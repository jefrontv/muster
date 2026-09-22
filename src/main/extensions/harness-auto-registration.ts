// Registers a freshly installed MCP server with every agent on this machine.
//
// Installing and wiring used to be two clicks, and the second one had no reason to exist: nobody
// installs an MCP server and then decides which agents should not see it. So the install does both
// and the harness rows become the place to withdraw one, not the place to grant it.
//
// An update is different. It refreshes entries that already exist, and adds none — a harness the
// user deliberately unregistered must stay unregistered through every later version.

import type {
  ExtensionEntry,
  ExtensionHarnessId,
  ExtensionMcpServerSpec
} from '../../shared/extension-catalog-types'
import type { ExtensionHarnessState } from '../../shared/extension-state-types'

export type HarnessRegistrationMode =
  /** First install, or taking over someone else's wiring: write every harness that is present. */
  | 'register-all'
  /** Update: rewrite the entries that exist so a moved binary is repaired, and add nothing. */
  | 'refresh-existing'

export type HarnessRegistrationDeps = {
  readStates: (server: ExtensionMcpServerSpec) => ExtensionHarnessState[]
  write: (server: ExtensionMcpServerSpec, harnessId: ExtensionHarnessId) => void
  logError: (harnessId: ExtensionHarnessId, error: unknown) => void
}

function shouldWrite(state: ExtensionHarnessState, mode: HarnessRegistrationMode): boolean {
  if (mode === 'refresh-existing') {
    return state.configured && !state.current
  }
  // Why presence gates a first install: writing ~/.cursor/mcp.json for someone who has never run
  // Cursor conjures config for a program they do not have, and the row would claim a registration
  // nothing will ever read.
  return state.present && !state.current
}

/**
 * Returns the labels of the harnesses it wrote, for the dialog to name.
 *
 * A failure on one harness is logged and skipped rather than thrown: the install itself succeeded,
 * and a single unwritable config should not turn a working install into a failed one. The harness
 * row still shows Register, so the user has the manual route.
 */
export function registerExtensionHarnesses(
  entry: ExtensionEntry,
  mode: HarnessRegistrationMode,
  deps: HarnessRegistrationDeps
): string[] {
  if (entry.install.method !== 'config-write') {
    return []
  }
  const server = entry.install.server
  const written: string[] = []
  for (const state of deps.readStates(server)) {
    if (!shouldWrite(state, mode)) {
      continue
    }
    try {
      deps.write(server, state.id)
      written.push(state.label)
    } catch (error) {
      deps.logError(state.id, error)
    }
  }
  return written
}
