// IPC for the Extension Hub.
//
// Handlers never throw across the bridge — an exception loses its type and its stack on the way to
// the renderer — so every channel answers with the tagged SiteResult union, matching ipc/site-mcp.ts.
//
// Nothing here runs a package manager, and nothing here writes settings. The only writes are the
// config splices Muster authored itself. A command install is handed back to the renderer as a
// string for the user to run in a terminal they can see, which is the boundary the ActiveCollab
// install drew and this feature keeps.
//
// Preferences (auto-update, dismissals) are written by the RENDERER through its own settings store
// instead. Writing them here left the renderer's copy stale, so a switch the user flipped snapped
// back and a dismissed card never went away.

import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import type { SiteResult } from '../../shared/site-types'
import type { ExtensionInventory } from '../../shared/extension-state-types'
import {
  EXTENSION_HARNESS_IDS,
  type ExtensionHarnessId
} from '../../shared/extension-catalog-types'
import {
  findCatalogEntry,
  installExtensionHarness,
  readExtensionInventory,
  resolveExtensionServer
} from '../extensions/extension-service'
import { uninstallExtensionMcpHarness } from '../extensions/mcp-entry-adapters'
import {
  cancelExtensionCommandRun,
  runExtensionCommandForEntry,
  type ExtensionRunMode
} from '../extensions/command-run'
import { registerExtensionHarnesses } from '../extensions/harness-auto-registration'
import { readExtensionMcpHarnessStates } from '../extensions/mcp-entry-adapters'
import { probeBinary } from '../extensions/binary-probe'
import { extensionCommandSpec } from '../../shared/extension-command-resolution'
import {
  prepareExtensionUninstall,
  setExtensionEnabled,
  trashDiscoveredSkill
} from '../extensions/extension-removal'

const CHANNELS = [
  'extensions:inventory',
  'extensions:installHarness',
  'extensions:uninstallHarness',
  'extensions:runCommand',
  'extensions:cancelCommand',
  'extensions:setEnabled',
  'extensions:uninstall',
  'extensions:removeSkill',
  'extensions:refreshHarnesses'
] as const

function failure<T>(error: unknown): SiteResult<T> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

function readHarnessId(value: unknown): ExtensionHarnessId {
  if (
    typeof value !== 'string' ||
    !(EXTENSION_HARNESS_IDS as readonly string[]).includes(value)
  ) {
    throw new TypeError('A known harness id is required.')
  }
  return value as ExtensionHarnessId
}

function readId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    throw new TypeError('An extension id is required.')
  }
  return value
}

async function writeHarness(
  store: Store,
  args: unknown,
  mode: 'install' | 'uninstall'
): Promise<SiteResult<ExtensionInventory>> {
  const input = (args ?? {}) as { id?: unknown; harnessId?: unknown }
  const id = readId(input.id)
  const harnessId = readHarnessId(input.harnessId)
  const inventory = await readExtensionInventory(store)
  const entry = findCatalogEntry(inventory, id)
  if (!entry || entry.install.method !== 'config-write') {
    throw new Error('That extension does not register an MCP server.')
  }
  if (mode === 'install') {
    installExtensionHarness(store, entry, harnessId)
  } else {
    uninstallExtensionMcpHarness(entry.install.server, harnessId)
  }
  // Why a fresh forced scan: the card the user is looking at must reflect the write that just
  // happened, and a cached inventory would show them the state from before they pressed the button.
  return { ok: true, value: await readExtensionInventory(store, { force: false }) }
}

export function registerExtensionHandlers(store: Store): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle(
    'extensions:inventory',
    async (_event, args?: unknown): Promise<SiteResult<ExtensionInventory>> => {
      try {
        const force = (args as { force?: unknown } | undefined)?.force === true
        return { ok: true, value: await readExtensionInventory(store, { force }) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'extensions:installHarness',
    async (_event, args?: unknown): Promise<SiteResult<ExtensionInventory>> => {
      try {
        return await writeHarness(store, args, 'install')
      } catch (error) {
        return failure(error)
      }
    }
  )

  // Why the renderer sends only an id: the command itself is resolved from the catalog in the main
  // process, so the window can pick from the curated list but can never say what runs.
  ipcMain.handle(
    'extensions:runCommand',
    async (_event, args?: unknown): Promise<SiteResult<{ command: string; code: number }>> => {
      try {
        const input = (args ?? {}) as { id?: unknown; mode?: unknown }
        const id = readId(input.id)
        // Only the two the renderer is allowed to start. Uninstall has its own channel, because it
        // clears the config entries first and that order is not the renderer's to choose.
        const mode: ExtensionRunMode = input.mode === 'setup' ? 'setup' : 'install'
        return { ok: true, value: await runExtensionCommandForEntry(store, id, mode) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'extensions:setEnabled',
    async (_event, args?: unknown): Promise<SiteResult<ExtensionInventory>> => {
      try {
        const input = (args ?? {}) as { id?: unknown; enabled?: unknown }
        await setExtensionEnabled(store, readId(input.id), input.enabled === true)
        return { ok: true, value: await readExtensionInventory(store) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  // Why the config entries are cleared here and the command runs separately: the removal command
  // streams its output to the dialog, and the caller decides whether there is one to run.
  ipcMain.handle(
    'extensions:uninstall',
    async (_event, args?: unknown): Promise<SiteResult<{ command: string | null }>> => {
      try {
        const id = readId((args as { id?: unknown } | undefined)?.id)
        const prepared = await prepareExtensionUninstall(store, id)
        if (prepared.command === null) {
          return { ok: true, value: { command: null } }
        }
        await runExtensionCommandForEntry(store, id, 'uninstall')
        return { ok: true, value: { command: prepared.command } }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle(
    'extensions:removeSkill',
    async (_event, args?: unknown): Promise<SiteResult<{ path: string }>> => {
      try {
        const id = readId((args as { id?: unknown } | undefined)?.id)
        return { ok: true, value: { path: await trashDiscoveredSkill(store, id) } }
      } catch (error) {
        return failure(error)
      }
    }
  )

  /**
   * Rewrites the harness entries this extension ALREADY has, and adds none.
   *
   * This is what a saved API key needs: the value lives in settings, which the renderer owns, so
   * the config files are stale until something rewrites them. Adding none is deliberate — saving a
   * field is not a request to register agents the user removed.
   */
  ipcMain.handle(
    'extensions:refreshHarnesses',
    async (_event, args?: unknown): Promise<SiteResult<ExtensionInventory>> => {
      try {
        const id = readId((args as { id?: unknown } | undefined)?.id)
        const inventory = await readExtensionInventory(store)
        const entry = findCatalogEntry(inventory, id)
        if (!entry) {
          throw new Error('That extension is not in the catalog.')
        }
        const server = resolveExtensionServer(store, entry)
        if (server) {
          const binaryName = extensionCommandSpec(entry)?.binary ?? null
          const binaryPath = binaryName ? probeBinary(binaryName).path : null
          registerExtensionHarnesses(entry, 'refresh-existing', {
            readStates: () => readExtensionMcpHarnessStates(server, binaryPath),
            write: (_spec, harnessId) => {
              installExtensionHarness(store, entry, harnessId)
            },
            logError: (harnessId, error) => {
              console.warn(`[extensions] could not refresh ${id} in ${harnessId}:`, error)
            }
          })
        }
        return { ok: true, value: await readExtensionInventory(store, { force: false }) }
      } catch (error) {
        return failure(error)
      }
    }
  )

  ipcMain.handle('extensions:cancelCommand', async (): Promise<SiteResult<null>> => {
    cancelExtensionCommandRun()
    return { ok: true, value: null }
  })

  ipcMain.handle(
    'extensions:uninstallHarness',
    async (_event, args?: unknown): Promise<SiteResult<ExtensionInventory>> => {
      try {
        return await writeHarness(store, args, 'uninstall')
      } catch (error) {
        return failure(error)
      }
    }
  )
}
