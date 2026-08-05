// The Site tab exists only when this mapping says so, so the matching rules are pinned here:
// exact path, the LocalWP app/public variant, and nothing looser.

import { describe, expect, it } from 'vitest'
import type { SiteSummary } from '../../../../shared/site-types'
import { findSiteForProject } from './site-for-project'

function makeSummary(path: string, localWpRoot: string): SiteSummary {
  return {
    site: {
      id: `site:${path}`,
      path,
      repoId: null,
      displayName: 'Acme',
      localWpRoot,
      localDomain: 'acme.local',
      localStack: localWpRoot.length > 0 ? 'localwp' : 'plain',
      dbUser: 'root',
      dbSocket: '',
      dbPort: null,
      phpVersion: '',
      activeEnvironment: 'main',
      environments: {},
      notes: '',
      searchReplaceTimeoutSeconds: 0
    },
    pathExists: true,
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

describe('findSiteForProject', () => {
  it('matches a repo checked out at the site path', () => {
    const summary = makeSummary('/Users/dev/Sites/acme', '')
    expect(findSiteForProject([summary], '/Users/dev/Sites/acme')).toBe(summary)
  })

  it('matches a repo living at the LocalWP WordPress subpath', () => {
    const summary = makeSummary('/Users/dev/Sites/acme', 'app/public')
    expect(findSiteForProject([summary], '/Users/dev/Sites/acme/app/public')).toBe(summary)
  })

  it('normalizes separators and trailing slashes before comparing', () => {
    const summary = makeSummary('/Users/dev/Sites/acme', 'app/public')
    expect(findSiteForProject([summary], '/Users/dev/Sites/acme/app/public/')).toBe(summary)
    expect(findSiteForProject([summary], '/Users/dev//Sites/acme')).toBe(summary)
  })

  it('ignores the subpath variant when localWpRoot is empty', () => {
    const summary = makeSummary('/Users/dev/Sites/acme', '')
    expect(findSiteForProject([summary], '/Users/dev/Sites/acme/app/public')).toBeNull()
  })

  it('does not match unrelated projects or a missing path', () => {
    const summary = makeSummary('/Users/dev/Sites/acme', 'app/public')
    expect(findSiteForProject([summary], '/Users/dev/Sites/other')).toBeNull()
    expect(findSiteForProject([summary], null)).toBeNull()
  })

  it('compares Windows drive paths case-insensitively', () => {
    const summary = makeSummary('C:\\Sites\\acme', 'app/public')
    expect(findSiteForProject([summary], 'c:/sites/acme/App/Public')).toBe(summary)
  })
})
