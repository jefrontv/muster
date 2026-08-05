// Readers for the opt-out agent capability settings.
//
// Every reader here treats "absent" as ENABLED. That is not laziness: these settings were added
// to installs where the site MCP was always registered and every bundled skill was always laid
// down, so a missing key has to keep meaning what it already meant. Only an explicit opt-out is
// ever recorded, which also keeps the persisted record small and makes a settings export readable.

import type { GlobalSettings } from './types'

type SitesMcpCapabilitySettings = Pick<GlobalSettings, 'agentCapabilitySitesMcp'>

export function isSitesMcpExposedToAgents(
  settings: SitesMcpCapabilitySettings | null | undefined
): boolean {
  return settings?.agentCapabilitySitesMcp !== false
}

export function isBundledSkillEnabled(
  capabilities: Readonly<Record<string, boolean>> | undefined,
  skillId: string
): boolean {
  return capabilities?.[skillId] !== false
}

/** Enabling removes the key rather than storing `true`, so the record only ever holds opt-outs. */
export function setBundledSkillEnabled(
  capabilities: Readonly<Record<string, boolean>> | undefined,
  skillId: string,
  enabled: boolean
): Record<string, boolean> {
  const next = { ...capabilities }
  if (enabled) {
    delete next[skillId]
  } else {
    next[skillId] = false
  }
  return next
}
