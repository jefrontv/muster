import { describe, expect, it } from 'vitest'
import type { Site, SiteSummary } from '../../../shared/site-types'
import { activeCollabProjectSiteKey } from '../../../shared/activecollab-project-site'
import { resolveActiveCollabSiteBinding } from './activecollab-site-binding'

const INSTANCE = 'https://projects.efront.com.au'

function site(overrides: Partial<Site> & { id: string }): Site {
  return {
    path: `/Sites/${overrides.id}`,
    repoId: null,
    displayName: overrides.id,
    localWpRoot: 'app/public',
    localDomain: `${overrides.id}.local`,
    localStack: 'localwp',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '8.2',
    activeEnvironment: 'main',
    environments: {},
    notes: '',
    searchReplaceTimeoutSeconds: 0,
    ...overrides
  }
}

function summaries(...list: Site[]): SiteSummary[] {
  return list.map((entry) => ({
    site: entry,
    pathExists: true,
    branch: null,
    resolvedEnvironment: {
      environment: 'main',
      reason: 'default-main',
      requiresConfirmation: false
    },
    secrets: {},
    importSelectedCount: 0,
    deploySelectedCount: 0
  }))
}

describe('resolveActiveCollabSiteBinding', () => {
  it('is unbound when the project has no entry', () => {
    expect(
      resolveActiveCollabSiteBinding({
        bindings: {},
        sites: summaries(site({ id: 'acme' })),
        instanceUrl: INSTANCE,
        projectId: 5937
      })
    ).toEqual({ kind: 'unbound' })
  })

  it('reports a bound site that no longer exists instead of resolving it', () => {
    // A site can be removed after binding. Answering "missing-site" lets the UI offer a re-bind
    // rather than rendering a button that would resolve to nothing.
    expect(
      resolveActiveCollabSiteBinding({
        bindings: { [activeCollabProjectSiteKey(INSTANCE, 5937)]: 'gone' },
        sites: summaries(site({ id: 'acme' })),
        instanceUrl: INSTANCE,
        projectId: 5937
      })
    ).toEqual({ kind: 'missing-site', siteId: 'gone' })
  })

  it('reports a bound site that is not open as a repo', () => {
    const acme = site({ id: 'acme', repoId: null })
    expect(
      resolveActiveCollabSiteBinding({
        bindings: { [activeCollabProjectSiteKey(INSTANCE, 5937)]: 'acme' },
        sites: summaries(acme),
        instanceUrl: INSTANCE,
        projectId: 5937
      })
    ).toEqual({ kind: 'needs-repo', site: acme })
  })

  it('resolves a bound, repo-backed site', () => {
    const acme = site({ id: 'acme', repoId: 'repo-1' })
    expect(
      resolveActiveCollabSiteBinding({
        bindings: { [activeCollabProjectSiteKey(INSTANCE, 5937)]: 'acme' },
        sites: summaries(acme),
        instanceUrl: INSTANCE,
        projectId: 5937
      })
    ).toEqual({ kind: 'ready', site: acme, repoId: 'repo-1' })
  })

  it('does not read another instance\u2019s binding for the same project id', () => {
    expect(
      resolveActiveCollabSiteBinding({
        bindings: { [activeCollabProjectSiteKey('https://other.example', 5937)]: 'acme' },
        sites: summaries(site({ id: 'acme', repoId: 'repo-1' })),
        instanceUrl: INSTANCE,
        projectId: 5937
      })
    ).toEqual({ kind: 'unbound' })
  })
})
