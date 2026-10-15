// Installed-state for a Claude Code plugin marketplace, read from Claude's own plugin records.
// A marketplace is a git checkout Claude manages, so there is no binary to probe.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export type ClaudeMarketplaceProbe = { installed: boolean; version: string | null }

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

/** Where Claude keeps a marketplace's checkout, or null when it is not added. */
export function claudeMarketplaceLocation(
  name: string,
  configDir = process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude')
): string | null {
  const known = readJson(path.join(configDir, 'plugins', 'known_marketplaces.json'))
  const record = (known as Record<string, { installLocation?: unknown }> | null)?.[name]
  if (!record) {
    return null
  }
  return typeof record.installLocation === 'string'
    ? record.installLocation
    : path.join(configDir, 'plugins', 'marketplaces', name)
}

export function probeClaudeMarketplace(
  name: string,
  configDir = process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude')
): ClaudeMarketplaceProbe {
  const location = claudeMarketplaceLocation(name, configDir)
  if (!location) {
    return { installed: false, version: null }
  }
  const manifest = readJson(path.join(location, '.claude-plugin', 'marketplace.json')) as {
    metadata?: { version?: unknown }
    version?: unknown
  } | null
  // A single-plugin marketplace often versions only its plugin.json.
  const plugin = readJson(path.join(location, '.claude-plugin', 'plugin.json')) as {
    version?: unknown
  } | null
  const version = manifest?.metadata?.version ?? manifest?.version ?? plugin?.version
  return { installed: true, version: typeof version === 'string' ? version : null }
}
