import type { SiteSummary } from '../../../../shared/site-types'

/**
 * Subsequence match, ported from ocsites' picker scoring (scan.py `_subseq_score`): typing `mjz`
 * finds `melbourne-jazz`. Exact and prefix hits outrank a scattered subsequence so the obvious
 * answer stays first.
 */
export function scoreSite(summary: SiteSummary, query: string): number {
  if (query.length === 0) {
    return 1
  }
  const needle = query.toLowerCase()
  const name = summary.site.displayName.toLowerCase()
  const path = summary.site.path.toLowerCase()

  if (name === needle) {
    return 1000
  }
  if (name.startsWith(needle)) {
    return 900 - name.length
  }
  if (name.includes(needle)) {
    return 700 - name.indexOf(needle)
  }

  let index = 0
  for (const character of name) {
    if (character === needle[index]) {
      index += 1
      if (index === needle.length) {
        return 400 - name.length
      }
    }
  }
  return path.includes(needle) ? 100 : 0
}

/**
 * Drops sites whose checkout is gone. A missing folder means an unmounted volume or a deleted
 * project, and neither can be opened, imported, or deployed — so the row is noise.
 *
 * Hiding is presentation-only and reversible: the preset keeps its config and the site returns
 * on the next refresh once the path is back.
 */
export function sitesOnDisk(sites: SiteSummary[]): SiteSummary[] {
  return sites.filter((summary) => summary.pathExists)
}

export function filterSites(sites: SiteSummary[], query: string): SiteSummary[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) {
    return sites
  }
  return sites
    .map((summary) => ({ summary, score: scoreSite(summary, trimmed) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.summary)
}
