// Wires the real probes into the inventory join, and owns the one-at-a-time scan.
//
// Kept apart from the IPC layer so the handlers stay a thin translation of arguments to results,
// and apart from the join so the join stays testable with no filesystem, network or daemon.
//
// Concurrency matters here: the renderer rescans on window focus, and a user alt-tabbing between
// Muster and a terminal could otherwise start a dozen overlapping scans, each shelling out to git
// and hitting two registries. Callers share one in-flight scan instead.

import { app } from 'electron'
import type { Store } from '../persistence'
import type { ExtensionInventory } from '../../shared/extension-state-types'
import type {
  ExtensionEntry,
  ExtensionHarnessId,
  ExtensionMcpServerSpec
} from '../../shared/extension-catalog-types'
import { readExtensionAutoUpdate } from '../../shared/extension-preferences'
import {
  applyExtensionSettingValues,
  declaredSettingValues,
  readExtensionSettingValues
} from '../../shared/extension-setting-values'
import { loadExtensionCatalog } from './catalog-source'
import { probeBinary } from './binary-probe'
import { probeExtensionAccess } from './extension-access'
import { probeLatestVersion } from './version-probe'
import { inventoryExtensions } from './extension-inventory'
import { extensionCommandSpec } from '../../shared/extension-command-resolution'
import { readExtensionMcpHarnessStates, installExtensionMcpHarness } from './mcp-entry-adapters'
import { inventorySkillFreshness } from '../skills/skill-freshness-inventory'
import {
  discoverSkillsOnTarget,
  resolveSkillDiscoveryTarget
} from '../skills/skill-discovery-target'
import { discoveredSkillEntries } from './discovered-skill-entries'
import { readAgentLocalDaemonStatus } from '../sites/agent-local-import-api'

let pending: Promise<ExtensionInventory> | null = null

async function readSkillStatuses(
  store: Store
): Promise<(skill: string) => { installed: boolean; outdated: boolean } | null> {
  try {
    const freshness = await inventorySkillFreshness({
      currentAppVersion: app.getVersion(),
      repos: store.getRepos()
    })
    const outdated = new Set(freshness.eligibleUpdateNames)
    const installed = new Set(freshness.installations.map((entry) => entry.name))
    return (skill) =>
      installed.has(skill) ? { installed: true, outdated: outdated.has(skill) } : null
  } catch {
    // A skill scan that fails should leave skill rows unknown, not fail the whole hub.
    return () => null
  }
}

async function readAgentLocal(): Promise<{ version: string | null; latest: string | null }> {
  // Why guarded: the daemon answers with empty strings when it is not running, and the module
  // itself refuses on platforms Agent Local does not support.
  try {
    const status = await readAgentLocalDaemonStatus()
    return {
      version: status.version.length > 0 ? status.version : null,
      latest: status.latest.length > 0 ? status.latest : null
    }
  } catch {
    return { version: null, latest: null }
  }
}

/**
 * Skills already on disk, as rows. Failure is not fatal: the curated list is still worth showing,
 * and an empty Skills tab is a better outcome than an error where the whole hub should be.
 */
async function readDiscoveredSkills(
  store: Store,
  catalogEntries: readonly { entry: { id: string } }[]
): Promise<Awaited<ReturnType<typeof discoveredSkillEntries>>> {
  try {
    const discovery = await discoverSkillsOnTarget(
      resolveSkillDiscoveryTarget(undefined),
      store.getRepos()
    )
    return discoveredSkillEntries(
      discovery,
      new Set(catalogEntries.map(({ entry }) => entry.id))
    )
  } catch {
    return []
  }
}

async function scan(store: Store, force: boolean): Promise<ExtensionInventory> {
  const loaded = await loadExtensionCatalog({ force })
  const settings = store.getSettings()
  const skillStatus = await readSkillStatuses(store)
  const agentLocal = await readAgentLocal()

  const entries = await inventoryExtensions(loaded.catalog, {
    platform: process.platform,
    probeBinary: (binary) => probeBinary(binary),
    readHarnessStates: (server, binaryPath, entry) =>
      readExtensionMcpHarnessStates(
        applyExtensionSettingValues(server, declaredSettingValues(entry, readExtensionSettingValues(settings, entry.id))),
        binaryPath
      ),
    probeLatest: (spec) => probeLatestVersion(spec),
    probeAccess: (spec) => probeExtensionAccess(spec),
    skillStatus: async (skill) => skillStatus(skill),
    readAgentLocal: async () => agentLocal,
    autoUpdate: readExtensionAutoUpdate(settings)
  })

  return {
    schemaVersion: 1,
    entries: [...entries, ...(await readDiscoveredSkills(store, entries))],
    catalogOrigin: loaded.origin,
    catalogUpdatedAt: loaded.catalog.updatedAt,
    scannedAt: Date.now(),
    ...(loaded.error ? { catalogError: loaded.error } : {})
  }
}

/** A forced refresh still joins an in-flight scan: two scans would not produce a fresher answer. */
export function readExtensionInventory(
  store: Store,
  options: { force?: boolean } = {}
): Promise<ExtensionInventory> {
  if (pending) {
    return pending
  }
  const request = scan(store, options.force === true).finally(() => {
    if (pending === request) {
      pending = null
    }
  })
  pending = request
  return request
}

export function findCatalogEntry(
  inventory: ExtensionInventory,
  id: string
): ExtensionEntry | null {
  return inventory.entries.find(({ entry }) => entry.id === id)?.entry ?? null
}

/**
 * The server spec as it should actually be written: catalog transports plus the user's own values.
 *
 * Every read and every write goes through this, so the entry Muster compares against is the entry
 * Muster would write. Skipping it on one side is what would make a filled-in API key read as drift.
 */
export function resolveExtensionServer(
  store: Store,
  entry: ExtensionEntry
): ExtensionMcpServerSpec | null {
  if (entry.install.method !== 'config-write') {
    return null
  }
  const values = declaredSettingValues(
    entry,
    readExtensionSettingValues(store.getSettings(), entry.id)
  )
  return applyExtensionSettingValues(entry.install.server, values)
}

/**
 * Writes one harness's entry for one extension.
 *
 * The binary is re-probed here rather than trusted from the last inventory: between the scan the
 * user is looking at and the button they just pressed, the binary may have moved, and writing a
 * stale absolute path into Codex produces a server that never starts.
 */
export function installExtensionHarness(
  store: Store,
  entry: ExtensionEntry,
  harnessId: ExtensionHarnessId
): string {
  const server = resolveExtensionServer(store, entry)
  if (!server) {
    throw new Error('That extension does not register an MCP server.')
  }
  const binaryName = extensionCommandSpec(entry)?.binary ?? null
  const binaryPath = binaryName ? probeBinary(binaryName).path : null
  return installExtensionMcpHarness(server, harnessId, binaryPath)
}

export function resetExtensionScanForTests(): void {
  pending = null
}
