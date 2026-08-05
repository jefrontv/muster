import { describe, expect, it } from 'vitest'
import type { SiteBindCandidate } from '../../../../shared/site-bind-types'
import { buildSiteBindSetupProposal } from './site-bind-setup-proposal'

function candidate(overrides: Partial<SiteBindCandidate> = {}): SiteBindCandidate {
  return {
    path: '/Users/dev/Documents/Sites/sulo',
    displayName: 'sulo',
    siteId: 'site-1',
    repoId: null,
    exists: false,
    ...overrides
  }
}

const ROOTS = ['/Users/dev/Documents/Sites', '/Volumes/devcenter-repos']

describe('buildSiteBindSetupProposal', () => {
  it('proposes the primary root plus the folder git will create', () => {
    expect(
      buildSiteBindSetupProposal({
        roots: ROOTS,
        cloneUrl: 'git@bitbucket.org:efront_au/sulo.git',
        candidates: []
      })
    ).toMatchObject({
      proposedPath: '/Users/dev/Documents/Sites/sulo',
      proposedRootLabel: 'Sites',
      needsFreshSetup: true
    })
  })

  it('falls back to the stale record folder when the link carried no clonable repo', () => {
    // Regression: a record whose checkout was deleted still names the folder the user expects.
    expect(
      buildSiteBindSetupProposal({ roots: ROOTS, cloneUrl: '', candidates: [candidate()] })
        .proposedPath
    ).toBe('/Users/dev/Documents/Sites/sulo')
  })

  it('does not need fresh setup when a candidate is reachable', () => {
    expect(
      buildSiteBindSetupProposal({
        roots: ROOTS,
        cloneUrl: 'git@bitbucket.org:efront_au/sulo.git',
        candidates: [candidate({ exists: true })]
      }).needsFreshSetup
    ).toBe(false)
  })

  it('still needs fresh setup when every candidate is gone', () => {
    expect(
      buildSiteBindSetupProposal({
        roots: ROOTS,
        cloneUrl: '',
        candidates: [candidate(), candidate({ path: '/old/sulo', exists: false })]
      }).needsFreshSetup
    ).toBe(true)
  })

  it('proposes nothing when no root is configured or derived', () => {
    expect(
      buildSiteBindSetupProposal({
        roots: [],
        cloneUrl: 'git@bitbucket.org:efront_au/sulo.git',
        candidates: []
      })
    ).toMatchObject({ proposedPath: '', proposedRootLabel: '' })
  })

  it('does not double the separator when a root has a trailing slash', () => {
    expect(
      buildSiteBindSetupProposal({
        roots: ['/Users/dev/Sites/'],
        cloneUrl: 'https://bitbucket.org/efront_au/sulo',
        candidates: []
      }).proposedPath
    ).toBe('/Users/dev/Sites/sulo')
  })
})
