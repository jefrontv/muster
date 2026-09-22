// Runs one catalog entry's install or update command and streams what it prints.
//
// The command is resolved HERE, from the catalog and the current inventory, and never taken from
// the renderer. That is the boundary that matters: the renderer asks to update an extension by id,
// it does not get to say what runs. A compromised or buggy renderer can pick from the curated list
// and nothing else.
//
// Output streams to the window as it arrives rather than arriving in one lump at the end, because
// the point of running it in front of the user is that they can see it working.
//
// A successful install also registers the server with the agents on this machine. Wiring it was
// never a decision anyone wanted to make separately; withdrawing it from one agent is.

import { BrowserWindow } from 'electron'
import type { Store } from '../persistence'
import { streamCommand } from '../lib/stream-command'
import {
  extensionCommandSpec,
  extensionUninstallCommand,
  resolveExtensionCommand
} from '../../shared/extension-command-resolution'
import type { ExtensionCommandRunEvent } from '../../shared/extension-run-types'
import type { ExtensionEntry } from '../../shared/extension-catalog-types'
import type { HarnessRegistrationMode } from './harness-auto-registration'
import { stripAnsiEscapes } from '../../shared/strip-ansi-escapes'
import {
  installExtensionHarness,
  readExtensionInventory,
  resolveExtensionServer
} from './extension-service'
import { probeBinary } from './binary-probe'
import { readExtensionMcpHarnessStates } from './mcp-entry-adapters'
import { registerExtensionHarnesses } from './harness-auto-registration'

const RUN_TIMEOUT_MS = 10 * 60_000
const MAX_OUTPUT_BYTES = 512 * 1024

let activeRun: { id: string; controller: AbortController } | null = null

function broadcast(event: ExtensionCommandRunEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('extensions:runEvent', event)
    }
  }
}

export function cancelExtensionCommandRun(): void {
  activeRun?.controller.abort()
}

/**
 * One run at a time. Two package managers racing each other is how a half-installed binary happens,
 * and the dialog only ever shows one anyway.
 */
export type ExtensionRunMode = 'install' | 'uninstall' | 'setup'

export async function runExtensionCommandForEntry(
  store: Store,
  id: string,
  mode: ExtensionRunMode = 'install'
): Promise<{ command: string; code: number }> {
  if (activeRun) {
    throw new Error('Another extension is already being installed. Wait for it to finish.')
  }
  const inventory = await readExtensionInventory(store)
  const item = inventory.entries.find(({ entry }) => entry.id === id)
  if (!item) {
    throw new Error('That extension is not in the catalog.')
  }
  const spec = extensionCommandSpec(item.entry)
  const resolved = mode === 'install' ? resolveExtensionCommand(item.entry, item.state) : null
  const command =
    mode === 'uninstall'
      ? extensionUninstallCommand(item.entry)
      : mode === 'setup'
        ? (spec?.setup ?? null)
        : (resolved?.command ?? null)
  if (!command) {
    throw new Error('There is no command to run for this extension.')
  }

  const controller = new AbortController()
  activeRun = { id, controller }
  broadcast({ kind: 'started', id, command })
  try {
    const result = await streamCommand(
      process.platform === 'win32' ? 'cmd' : 'sh',
      process.platform === 'win32' ? ['/c', command] : ['-c', command],
      {
        timeoutMs: RUN_TIMEOUT_MS,
        maxBytes: MAX_OUTPUT_BYTES,
        signal: controller.signal,
        // Why non-interactive: there is no TTY behind this, so a command that stops to ask a
        // question would hang with nothing on screen. Forced this way it fails fast and says why,
        // and the dialog still offers the command to run by hand.
        env: {
          ...process.env,
          CI: '1',
          GIT_TERMINAL_PROMPT: '0',
          DEBIAN_FRONTEND: 'noninteractive',
          PIP_DISABLE_PIP_VERSION_CHECK: '1',
          // Why all four: package managers disagree about which one turns colour off, and the run
          // pane is a <pre>, so anything they emit arrives as literal escape noise.
          NO_COLOR: '1',
          FORCE_COLOR: '0',
          TERM: 'dumb',
          CLICOLOR: '0'
        },
        onStdout: (chunk) => broadcast({ kind: 'output', id, chunk: stripAnsiEscapes(chunk) }),
        onStderr: (chunk) => broadcast({ kind: 'output', id, chunk: stripAnsiEscapes(chunk) })
      }
    )
    // Why re-probe rather than trust the exit code: `npm install -g` from a git remote exits 0 even
    // when the package never builds, leaving a bin symlink pointing at nothing.
    const binary = spec?.binary ?? item.entry.id
    const installed = mode === 'uninstall' ? false : probeBinary(binary).found
    // Why setup registers nothing: it configures software that is already installed and already
    // wired, so re-running the write would only churn files the user may have edited since.
    const shouldRegister = mode === 'install' && installed && result.code === 0
    broadcast({
      kind: 'finished',
      id,
      code: result.code,
      timedOut: result.timedOut,
      installed,
      registeredHarnesses: shouldRegister
        ? autoRegister(
            store,
            item.entry,
            resolved?.kind === 'update' ? 'refresh-existing' : 'register-all'
          )
        : []
    })
    return { command, code: result.code }
  } finally {
    activeRun = null
  }
}

/**
 * Hands the freshly installed server to the agents on this machine.
 *
 * Read fresh rather than reused from the inventory above: that scan ran before the install, so its
 * harness rows describe a machine where the binary did not exist yet, and every stdio entry would
 * have been refused for pointing at nothing.
 */
function autoRegister(
  store: Store,
  entry: ExtensionEntry,
  mode: HarnessRegistrationMode
): string[] {
  const binaryName = extensionCommandSpec(entry)?.binary ?? null
  const binaryPath = binaryName ? probeBinary(binaryName).path : null
  const resolved = resolveExtensionServer(store, entry)
  if (!resolved) {
    return []
  }
  return registerExtensionHarnesses(entry, mode, {
    readStates: () => readExtensionMcpHarnessStates(resolved, binaryPath),
    write: (_server, harnessId) => {
      installExtensionHarness(store, entry, harnessId)
    },
    logError: (harnessId, error) => {
      console.warn(`[extensions] could not register ${entry.id} with ${harnessId}:`, error)
    }
  })
}
