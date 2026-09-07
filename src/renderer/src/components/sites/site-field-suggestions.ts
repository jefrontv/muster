// Values a field already holds on other site configurations. The same SSH hosts, remote roots and
// build commands recur across a shop's sites, so retyping them is both slow and a source of typos.

import type { Site, SiteEnvironment, SiteSummary } from '../../../../shared/site-types'

/** Environment keys worth suggesting: shared infrastructure, not per-site identity. */
export type SiteEnvironmentSuggestionField = Extract<
  keyof SiteEnvironment,
  'hostname' | 'username' | 'rootPath' | 'liveDomain' | 'deployCommand' | 'themeDistPath'
>

/** Site-level keys the panel may offer suggestions for; the panel decides which actually do. */
export type SiteSuggestionField = Extract<
  keyof Site,
  'localDomain' | 'localWpRoot' | 'dbUser' | 'dbSocket'
>

function rank(values: string[]): string[] {
  const counts = new Map<string, { value: string; count: number }>()
  for (const raw of values) {
    const value = raw.trim()
    if (value.length === 0) {
      continue
    }
    const key = value.toLowerCase()
    const existing = counts.get(key)
    if (existing) {
      existing.count += 1
      continue
    }
    counts.set(key, { value, count: 1 })
  }
  // Most-used first: the shared host everything deploys to should be the first thing offered.
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .map((entry) => entry.value)
}

export function collectSiteEnvironmentSuggestions(
  summaries: readonly SiteSummary[],
  field: SiteEnvironmentSuggestionField,
  /** The site being edited; its own values are what the user is replacing, so they are excluded. */
  currentSiteId: string
): string[] {
  return rank(
    summaries
      .filter((summary) => summary.site.id !== currentSiteId)
      .flatMap((summary) => Object.values(summary.site.environments).map((env) => env[field]))
  )
}

export function collectSiteSuggestions(
  summaries: readonly SiteSummary[],
  field: SiteSuggestionField,
  currentSiteId: string
): string[] {
  return rank(
    summaries
      .filter((summary) => summary.site.id !== currentSiteId)
      .map((summary) => summary.site[field])
  )
}
