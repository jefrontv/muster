// The values a user fills in for an extension, and how they reach the MCP entry Muster writes.
//
// The catalog declares the NAME of an environment variable; the value is the user's and lives in
// their settings. Applying it produces a new server spec rather than mutating one, so every place
// that reads or writes a harness entry sees the same effective transport and the detection compare
// stays honest — without this, adding a key made the stored entry stop matching what Muster would
// write, so the row read "out of date" and rewriting it wiped the key.

import type {
  ExtensionEntry,
  ExtensionMcpServerSpec,
  ExtensionSettingSpec
} from './extension-catalog-types'
import type { GlobalSettings } from './types'

export type ExtensionSettingValues = Record<string, string>

type SettingsSlice = Pick<GlobalSettings, 'extensionSettingValues'> | null | undefined

export function readExtensionSettingValues(
  settings: SettingsSlice,
  id: string
): ExtensionSettingValues {
  return settings?.extensionSettingValues?.[id] ?? {}
}

/**
 * Only the keys the catalog declares, and only non-empty ones.
 *
 * Filtering by the spec means a key left behind by an older catalog stops being written the moment
 * the entry no longer asks for it, rather than lingering in every config Muster touches. Dropping
 * blanks is what makes clearing a field work: the value goes away instead of being written as "".
 */
export function declaredSettingValues(
  entry: ExtensionEntry,
  values: ExtensionSettingValues
): ExtensionSettingValues {
  const declared: ExtensionSettingValues = {}
  for (const spec of entry.settings ?? []) {
    const value = values[spec.key]?.trim()
    if (value) {
      declared[spec.key] = value
    }
  }
  return declared
}

/** Writes the user's values into every stdio transport's env. http transports carry no env. */
export function applyExtensionSettingValues(
  server: ExtensionMcpServerSpec,
  values: ExtensionSettingValues
): ExtensionMcpServerSpec {
  if (Object.keys(values).length === 0) {
    return server
  }
  return {
    ...server,
    harnesses: server.harnesses.map((harness) =>
      harness.transport.kind === 'stdio'
        ? {
            ...harness,
            // Catalog env first so a user value wins: the whole point is to fill in what the
            // published entry left blank.
            transport: { ...harness.transport, env: { ...harness.transport.env, ...values } }
          }
        : harness
    )
  }
}

/** Null when the entry declares nothing to fill in, so callers can skip the whole form. */
export function extensionSettingSpecs(entry: ExtensionEntry): ExtensionSettingSpec[] | null {
  const specs = entry.settings ?? []
  return specs.length > 0 ? specs : null
}

export function setExtensionSettingValues(
  existing: GlobalSettings['extensionSettingValues'],
  id: string,
  values: ExtensionSettingValues
): NonNullable<GlobalSettings['extensionSettingValues']> {
  const next = { ...existing }
  const kept = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value.trim().length > 0)
  )
  if (Object.keys(kept).length === 0) {
    delete next[id]
    return next
  }
  next[id] = kept
  return next
}
