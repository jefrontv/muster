// The launch pass that applies updates the user asked not to be asked about.
//
// Rules this file exists to enforce, in order of how badly they would hurt if broken:
//
//  1. Once, at launch, before a harness is spawned. Replacing a binary or rewriting an MCP config
//     underneath a running agent is the one way this feature could ruin someone's afternoon.
//  2. Serial. One package manager at a time; two pipx runs racing each other is a broken install.
//  3. Capped and non-interactive. A command that waits for a TTY would otherwise hang the pass for
//     as long as the process lives, invisibly, because nobody is watching this terminal.
//  4. A failure switches that entry back to manual. Retrying a broken command on every launch is
//     how a small problem becomes a daily one.
//  5. Every applied update leaves a record. "Unattended" must never mean "unrecorded" — the user
//     has to be able to find out what changed under them.

import type { Store } from '../persistence'
import { streamCommand } from '../lib/stream-command'
import { extensionCommandSpec } from '../../shared/extension-command-resolution'
import {
  readExtensionAutoUpdate,
  setExtensionAutoUpdateEntry
} from '../../shared/extension-preferences'
import { eligibleExtensionAutoUpdates } from '../../shared/extension-state-types'
import type { ExtensionInventoryEntry } from '../../shared/extension-state-types'
import { readExtensionInventory } from './extension-service'

const PER_ENTRY_TIMEOUT_MS = 60_000
const MAX_OUTPUT_BYTES = 128 * 1024

export type ExtensionAutoUpdateOutcome = {
  id: string
  name: string
  from: string | null
  to: string | null
  ok: boolean
  error?: string
}

export type AutoUpdateRunnerEnv = {
  runCommand: (command: string) => Promise<{ code: number; stderr: string; timedOut: boolean }>
  /** Called once per failed entry so it stops being attempted unattended. */
  disableAutoUpdate: (id: string) => void
  log: (outcomes: ExtensionAutoUpdateOutcome[]) => void
}

function defaultRunCommand(
  command: string
): Promise<{ code: number; stderr: string; timedOut: boolean }> {
  return streamCommand(process.platform === 'win32' ? 'cmd' : 'sh',
    process.platform === 'win32' ? ['/c', command] : ['-c', command], {
    timeoutMs: PER_ENTRY_TIMEOUT_MS,
    maxBytes: MAX_OUTPUT_BYTES,
    // Why these three: with no TTY and no prompts allowed, a command that wants a human fails fast
    // and visibly instead of hanging until the timeout with nothing to show for it.
    env: {
      ...process.env,
      CI: '1',
      GIT_TERMINAL_PROMPT: '0',
      DEBIAN_FRONTEND: 'noninteractive'
    }
  }).then((result) => ({ code: result.code, stderr: result.stderr, timedOut: result.timedOut }))
}

export function createDefaultAutoUpdateRunnerEnv(store: Store): AutoUpdateRunnerEnv {
  return {
    runCommand: defaultRunCommand,
    disableAutoUpdate: (id) => {
      // Why this one settings write stays in main: it happens at launch, before a renderer exists
      // to write it, and it is a safety brake rather than a preference the user just expressed.
      store.updateSettings({
        extensionAutoUpdate: setExtensionAutoUpdateEntry(
          readExtensionAutoUpdate(store.getSettings()),
          id,
          false
        )
      })
    },
    log: (outcomes) => {
      for (const outcome of outcomes) {
        const summary = `${outcome.name} ${outcome.from ?? '?'} -> ${outcome.to ?? '?'}`
        if (outcome.ok) {
          console.info(`[extensions] auto-updated ${summary}`)
        } else {
          console.warn(`[extensions] auto-update failed for ${summary}: ${outcome.error}`)
        }
      }
    }
  }
}

function updateCommandFor(item: ExtensionInventoryEntry): string | null {
  const spec = extensionCommandSpec(item.entry)
  return spec?.update ?? spec?.install ?? null
}

async function applyOne(
  item: ExtensionInventoryEntry,
  env: AutoUpdateRunnerEnv
): Promise<ExtensionAutoUpdateOutcome> {
  const base = {
    id: item.entry.id,
    name: item.entry.name,
    from: item.state.installedVersion,
    to: item.state.latestVersion
  }
  const command = updateCommandFor(item)
  if (command === null) {
    // Why disable rather than skip quietly: an entry marked auto-updatable with nothing to run is a
    // catalog mistake, and silently retrying it every launch hides that.
    env.disableAutoUpdate(item.entry.id)
    return { ...base, ok: false, error: 'No update command for this extension.' }
  }
  try {
    const result = await env.runCommand(command)
    if (result.code === 0) {
      return { ...base, ok: true }
    }
    env.disableAutoUpdate(item.entry.id)
    return {
      ...base,
      ok: false,
      error: result.timedOut
        ? 'The update command ran past its time limit and was stopped.'
        : result.stderr.trim().slice(0, 500) || `Exited with code ${result.code}.`
    }
  } catch (cause) {
    env.disableAutoUpdate(item.entry.id)
    return { ...base, ok: false, error: cause instanceof Error ? cause.message : String(cause) }
  }
}

/**
 * Returns what it did, so the caller can tell the user. An empty array is the common case and means
 * there was nothing eligible, not that anything went wrong.
 */
export async function runExtensionAutoUpdates(
  store: Store,
  env: AutoUpdateRunnerEnv = createDefaultAutoUpdateRunnerEnv(store)
): Promise<ExtensionAutoUpdateOutcome[]> {
  const eligible = eligibleExtensionAutoUpdates(await readExtensionInventory(store))
  if (eligible.length === 0) {
    return []
  }

  const outcomes: ExtensionAutoUpdateOutcome[] = []
  for (const item of eligible) {
    outcomes.push(await applyOne(item, env))
  }
  env.log(outcomes)
  return outcomes
}
