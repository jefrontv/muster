// Claude Code's own per-marketplace auto-update flag, driven by the Extension Hub's switch.
//
// Claude reads `extraKnownMarketplaces.<name>.autoUpdate` from user settings only, and has no CLI
// flag for it, so the hub edits that one key. With it on, Claude refreshes the marketplace and its
// plugins at every launch, even while Muster is closed.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { Store } from '../persistence'
import { readExtensionAutoUpdate } from '../../shared/extension-preferences'
import { supportsExtensionAutoUpdate } from '../../shared/extension-catalog-types'
import { extensionCommandSpec } from '../../shared/extension-command-resolution'
import { readExtensionInventory } from './extension-service'

export type ClaudeAutoUpdateWrite = 'written' | 'unchanged' | 'not-installed' | 'unreadable'

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null
}

function readJsonObject(file: string): JsonObject | null | 'unreadable' {
  if (!existsSync(file)) {
    return null
  }
  try {
    return asObject(JSON.parse(readFileSync(file, 'utf8'))) ?? 'unreadable'
  } catch {
    return 'unreadable'
  }
}

export function setClaudeMarketplaceAutoUpdate(
  name: string,
  enabled: boolean,
  configDir = process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude')
): ClaudeAutoUpdateWrite {
  const settingsFile = path.join(configDir, 'settings.json')
  const settings = readJsonObject(settingsFile)
  // Why: never replace a settings file this could not parse; it may hold hand edits mid-save.
  if (settings === 'unreadable') {
    return 'unreadable'
  }
  const declared = asObject(settings?.extraKnownMarketplaces) ?? {}
  const entry = asObject(declared[name])
  let source = entry?.source
  if (source === undefined) {
    const known = readJsonObject(path.join(configDir, 'plugins', 'known_marketplaces.json'))
    source = known === 'unreadable' ? undefined : asObject(known?.[name])?.source
  }
  if (source === undefined) {
    return 'not-installed'
  }
  if (entry?.autoUpdate === enabled) {
    return 'unchanged'
  }
  const next = {
    ...settings,
    extraKnownMarketplaces: { ...declared, [name]: { ...entry, source, autoUpdate: enabled } }
  }
  const temp = `${settingsFile}.muster-${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  renameSync(temp, settingsFile)
  return 'written'
}

/**
 * Pushes the hub's switch state to Claude for the given entries, or with 'master', for every
 * entry that follows the master switch. Entries someone set individually are left alone then.
 */
export async function syncClaudeMarketplaceAutoUpdates(
  store: Store,
  scope: readonly string[] | 'master'
): Promise<void> {
  const preferences = readExtensionAutoUpdate(store.getSettings())
  const inventory = await readExtensionInventory(store)
  for (const { entry } of inventory.entries) {
    const marketplace = extensionCommandSpec(entry)?.claudeMarketplace
    if (!marketplace || !supportsExtensionAutoUpdate(entry)) {
      continue
    }
    const explicit = preferences.entries[entry.id]
    const inScope = scope === 'master' ? explicit === undefined : scope.includes(entry.id)
    if (inScope) {
      // Why from settings, not the inventory state: a scan already in flight predates this change.
      setClaudeMarketplaceAutoUpdate(marketplace, explicit ?? preferences.master)
    }
  }
}
