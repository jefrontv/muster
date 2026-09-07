import { describe, expect, it } from 'vitest'
import {
  createEmptySiteEnvironment,
  type Site,
  type SiteEnvironment,
  type SiteSummary
} from '../../../../shared/site-types'
import { collectSiteEnvironmentSuggestions, collectSiteSuggestions } from './site-field-suggestions'

function summary(
  id: string,
  environments: Record<string, Partial<SiteEnvironment>>,
  site: Partial<Site> = {}
): SiteSummary {
  return {
    site: {
      id,
      path: `/tmp/${id}`,
      repoId: null,
      displayName: id,
      localWpRoot: '',
      localDomain: '',
      localStack: 'plain',
      dbUser: '',
      dbSocket: '',
      dbPort: null,
      phpVersion: '',
      activeEnvironment: '',
      environments: Object.fromEntries(
        Object.entries(environments).map(([name, patch]) => [
          name,
          { ...createEmptySiteEnvironment(), ...patch }
        ])
      ),
      notes: '',
      searchReplaceTimeoutSeconds: 600,
      customSteps: [],
      ...site
    },
    pathExists: true,
    branch: null,
    resolvedEnvironment: {
      environment: null,
      requiresConfirmation: false,
      reason: 'no-environments'
    },
    secrets: {},
    importSelectedCount: 0,
    deploySelectedCount: 0
  }
}

describe('collectSiteEnvironmentSuggestions', () => {
  it('orders by how many environments use the value, then alphabetically', () => {
    const summaries = [
      summary('a', {
        main: { hostname: 'shared.example.com' },
        staging: { hostname: 'one.example.com' }
      }),
      summary('b', { main: { hostname: 'shared.example.com' } }),
      summary('c', { main: { hostname: 'another.example.com' } })
    ]

    expect(collectSiteEnvironmentSuggestions(summaries, 'hostname', 'zzz')).toEqual([
      'shared.example.com',
      'another.example.com',
      'one.example.com'
    ])
  })

  it('excludes the site being edited, so a field never suggests what it already holds', () => {
    const summaries = [
      summary('a', { main: { hostname: 'mine.example.com' } }),
      summary('b', { main: { hostname: 'theirs.example.com' } })
    ]

    expect(collectSiteEnvironmentSuggestions(summaries, 'hostname', 'a')).toEqual([
      'theirs.example.com'
    ])
  })

  it('drops blanks and collapses values that differ only in case or padding', () => {
    const summaries = [
      summary('a', { main: { rootPath: 'public_html' }, staging: { rootPath: '  Public_HTML ' } }),
      summary('b', { main: { rootPath: '' } })
    ]

    expect(collectSiteEnvironmentSuggestions(summaries, 'rootPath', 'zzz')).toEqual(['public_html'])
  })
})

describe('collectSiteSuggestions', () => {
  it('reads site-level fields and skips the current site', () => {
    const summaries = [
      summary('a', {}, { dbUser: 'root' }),
      summary('b', {}, { dbUser: 'wordpress' }),
      summary('c', {}, { dbUser: 'root' })
    ]

    expect(collectSiteSuggestions(summaries, 'dbUser', 'b')).toEqual(['root'])
  })
})
