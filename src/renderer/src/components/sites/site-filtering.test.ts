import { describe, expect, it } from 'vitest'
import type { SiteSummary } from '../../../../shared/site-types'
import { filterSites, scoreSite, sitesOnDisk } from './site-filtering'

function summary(
  displayName: string,
  path = `/Sites/${displayName}`,
  pathExists = true
): SiteSummary {
  return {
    site: {
      id: displayName,
      path,
      repoId: null,
      displayName,
      localWpRoot: '',
      localDomain: '',
      localStack: 'plain',
      dbUser: 'root',
      dbSocket: '',
      dbPort: null,
      phpVersion: '',
      activeEnvironment: 'production',
      environments: {},
      notes: '',
      searchReplaceTimeoutSeconds: 600
    },
    pathExists,
    branch: null,
    resolvedEnvironment: {
      environment: null,
      reason: 'no-environments',
      requiresConfirmation: true
    },
    secrets: {},
    importSelectedCount: 0,
    deploySelectedCount: 0
  }
}

describe('scoreSite', () => {
  it('ranks an exact name above a prefix above a substring above a subsequence', () => {
    const exact = scoreSite(summary('acme'), 'acme')
    const prefix = scoreSite(summary('acme-corp'), 'acme')
    const substring = scoreSite(summary('the-acme-corp'), 'acme')
    const subsequence = scoreSite(summary('melbourne-jazz'), 'mjz')
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(substring)
    expect(substring).toBeGreaterThan(subsequence)
    expect(subsequence).toBeGreaterThan(0)
  })

  it('matches a scattered subsequence the way the ocsites picker did', () => {
    expect(scoreSite(summary('melbourne-jazz'), 'mjz')).toBeGreaterThan(0)
    expect(scoreSite(summary('melbourne-jazz'), 'zjm')).toBe(0)
  })

  it('falls back to a path match so a site can be found by its folder', () => {
    expect(scoreSite(summary('site-a', '/Volumes/devcenter/clientx'), 'clientx')).toBeGreaterThan(0)
  })

  it('treats an empty query as a match for everything', () => {
    expect(scoreSite(summary('anything'), '')).toBe(1)
  })
})

describe('filterSites', () => {
  const sites = [summary('acme-corp'), summary('melbourne-jazz'), summary('zeta')]

  it('returns the original list untouched for a blank query', () => {
    expect(filterSites(sites, '   ')).toBe(sites)
  })

  it('drops non-matches and orders by score', () => {
    expect(filterSites(sites, 'acme').map((entry) => entry.site.displayName)).toEqual(['acme-corp'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterSites(sites, 'qqqq')).toEqual([])
  })

  it('is case-insensitive', () => {
    expect(filterSites(sites, 'ACME')).toHaveLength(1)
  })
})

describe('sitesOnDisk', () => {
  it('drops sites whose checkout folder is gone', () => {
    const kept = summary('present')
    const result = sitesOnDisk([kept, summary('unmounted', '/Volumes/gone/unmounted', false)])

    expect(result).toEqual([kept])
  })

  it('keeps every site when all checkouts exist', () => {
    const sites = [summary('a'), summary('b')]

    expect(sitesOnDisk(sites)).toEqual(sites)
  })

  it('returns an empty list when no checkout exists', () => {
    const sites = [summary('a', '/gone/a', false), summary('b', '/gone/b', false)]

    expect(sitesOnDisk(sites)).toEqual([])
  })

  it('composes with search so a missing site cannot be surfaced by querying its name', () => {
    const sites = [summary('acme-live'), summary('acme-dead', '/gone/acme-dead', false)]

    expect(filterSites(sitesOnDisk(sites), 'acme').map((entry) => entry.site.displayName)).toEqual([
      'acme-live'
    ])
  })
})
