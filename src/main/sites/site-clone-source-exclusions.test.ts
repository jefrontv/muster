import { describe, expect, it } from 'vitest'
import type { CloneSourceRepo } from '../../shared/site-clone-source-types'
import {
  buildExistingSiteFootprint,
  isAlreadyPresent,
  type ExistingSiteFootprint
} from './site-clone-source-exclusions'

function repo(overrides: Partial<CloneSourceRepo> = {}): CloneSourceRepo {
  return {
    provider: 'bitbucket',
    fullName: 'acme/website',
    cloneUrl: 'git@bitbucket.org:acme/website.git',
    description: '',
    updatedAt: null,
    isPrivate: true,
    ...overrides
  }
}

function footprint(
  overrides: Partial<Parameters<typeof buildExistingSiteFootprint>[0]> = {}
): ExistingSiteFootprint {
  return buildExistingSiteFootprint({
    repos: [],
    sitePaths: [],
    discoveredPaths: [],
    ...overrides
  })
}

describe('buildExistingSiteFootprint', () => {
  it('collects canonical keys and basenames from all three sources', () => {
    const result = footprint({
      repos: [
        {
          path: '/Users/jake/Sites/website',
          gitRemoteIdentity: { canonicalKey: 'bitbucket.org/acme/website' }
        }
      ],
      sitePaths: ['/Users/jake/Sites/blog'],
      discoveredPaths: ['/Users/jake/Sites/unadopted']
    })

    expect([...result.remoteKeys]).toEqual(['bitbucket.org/acme/website'])
    expect([...result.occupiedNames].sort()).toEqual(['blog', 'unadopted', 'website'])
  })

  it('lowercases occupied names so the slug check is case-insensitive', () => {
    expect([...footprint({ sitePaths: ['/Users/jake/Sites/MyProject'] }).occupiedNames]).toEqual([
      'myproject'
    ])
  })

  it('skips a repo with no remote identity without losing its directory name', () => {
    const result = footprint({
      repos: [
        { path: '/Users/jake/Sites/legacy' },
        { path: '/Users/jake/Sites/other', gitRemoteIdentity: null }
      ]
    })

    expect(result.remoteKeys.size).toBe(0)
    expect([...result.occupiedNames].sort()).toEqual(['legacy', 'other'])
  })

  it('ignores a path with no basename rather than occupying the empty name', () => {
    // A repo whose full name has no slug would otherwise match this entry and vanish from the list.
    expect(footprint({ sitePaths: ['', '/', '///'] }).occupiedNames.size).toBe(0)
  })

  it('tolerates a trailing separator, which a stored path may carry', () => {
    expect([...footprint({ sitePaths: ['/Users/jake/Sites/blog/'] }).occupiedNames]).toEqual([
      'blog'
    ])
  })
})

describe('isAlreadyPresent', () => {
  it('matches an ssh clone URL against an https-derived canonical key', () => {
    const present = footprint({
      repos: [
        { path: '/elsewhere/checkout', gitRemoteIdentity: { canonicalKey: 'github.com/acme/api' } }
      ]
    })

    expect(
      isAlreadyPresent(
        repo({ provider: 'github', fullName: 'acme/api', cloneUrl: 'git@github.com:acme/api.git' }),
        present
      )
    ).toBe(true)
    expect(
      isAlreadyPresent(
        repo({
          provider: 'github',
          fullName: 'acme/api',
          cloneUrl: 'https://github.com/acme/api.git'
        }),
        present
      )
    ).toBe(true)
  })

  it('matches a clone URL with no .git suffix against a key derived from one that had it', () => {
    const present = footprint({
      repos: [
        {
          path: '/elsewhere/checkout',
          gitRemoteIdentity: { canonicalKey: 'bitbucket.org/acme/website' }
        }
      ]
    })

    expect(
      isAlreadyPresent(
        repo({ fullName: 'acme/website', cloneUrl: 'https://bitbucket.org/acme/website' }),
        present
      )
    ).toBe(true)
  })

  // Roughly half the recorded repos predate gitRemoteIdentity capture, so this is the common path.
  it('matches on the slug when the repo carries no remote identity at all', () => {
    expect(
      isAlreadyPresent(
        repo({ fullName: 'acme/website' }),
        footprint({ repos: [{ path: '/Users/jake/Sites/website' }] })
      )
    ).toBe(true)
  })

  it('matches a slug that differs only in case from the folder on disk', () => {
    expect(
      isAlreadyPresent(
        repo({ fullName: 'acme/WebSite' }),
        footprint({ discoveredPaths: ['/Users/jake/Sites/website'] })
      )
    ).toBe(true)
  })

  it('matches a same-named repo under a different owner, because the clone would collide anyway', () => {
    expect(
      isAlreadyPresent(
        repo({ fullName: 'other-org/website' }),
        footprint({ sitePaths: ['/Users/jake/Sites/website'] })
      )
    ).toBe(true)
  })

  it('lets a repo through when neither its remote nor its slug is known', () => {
    expect(
      isAlreadyPresent(
        repo({ fullName: 'acme/brand-new', cloneUrl: 'git@bitbucket.org:acme/brand-new.git' }),
        footprint({
          repos: [
            {
              path: '/Users/jake/Sites/website',
              gitRemoteIdentity: { canonicalKey: 'bitbucket.org/acme/website' }
            }
          ],
          sitePaths: ['/Users/jake/Sites/blog'],
          discoveredPaths: ['/Users/jake/Sites/unadopted']
        })
      )
    ).toBe(false)
  })

  it('excludes nothing against an empty footprint', () => {
    expect(isAlreadyPresent(repo(), footprint())).toBe(false)
  })

  // normalizeGitRemoteUrl returns null for anything it cannot parse; the slug must still decide.
  it('still applies the slug check when the clone URL does not normalise', () => {
    const unparseable = repo({ fullName: 'acme/website', cloneUrl: 'not a url at all' })

    expect(
      isAlreadyPresent(unparseable, footprint({ sitePaths: ['/Users/jake/Sites/website'] }))
    ).toBe(true)
    expect(
      isAlreadyPresent(unparseable, footprint({ sitePaths: ['/Users/jake/Sites/blog'] }))
    ).toBe(false)
  })

  it('does not match a repo whose full name has no slug against an empty-named entry', () => {
    expect(isAlreadyPresent(repo({ fullName: '' }), footprint({ sitePaths: ['/'] }))).toBe(false)
  })
})
