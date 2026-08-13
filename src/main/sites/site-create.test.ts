import { describe, expect, it } from 'vitest'
import {
  createEmptySiteEnvironment,
  DEFAULT_SITE_ENVIRONMENT_NAME,
  type Site
} from '../../shared/site-types'
import { adoptOrCreateSite } from './site-create'

function site(path: string, overrides: Partial<Site> = {}): Site {
  return {
    id: 'existing-id',
    path,
    repoId: null,
    displayName: 'ebes',
    localWpRoot: '',
    localDomain: 'ebes.local',
    localStack: 'agent-local',
    dbUser: '',
    dbSocket: '',
    dbPort: null,
    phpVersion: '8.4',
    activeEnvironment: DEFAULT_SITE_ENVIRONMENT_NAME,
    environments: { [DEFAULT_SITE_ENVIRONMENT_NAME]: createEmptySiteEnvironment() },
    notes: '',
    searchReplaceTimeoutSeconds: 600,
    ...overrides
  }
}

function store(existing: Site | null): {
  findSiteByPath: (sitePath: string) => Site | null
  upsertSite: (next: Site) => Site
  upserted: Site[]
} {
  const upserted: Site[] = []
  return {
    upserted,
    findSiteByPath: (sitePath) => (existing && existing.path === sitePath ? existing : null),
    upsertSite: (next) => {
      upserted.push(next)
      return next
    }
  }
}

describe('adoptOrCreateSite', () => {
  it('returns the existing record for the path instead of minting a duplicate', () => {
    const existing = site('/Users/jake/Sites/ebes')
    const backing = store(existing)

    const result = adoptOrCreateSite(backing, {
      path: '/Users/jake/Sites/ebes',
      displayName: 'ebes'
    })

    expect(result).toBe(existing)
    expect(backing.upserted).toEqual([])
  })

  it('creates a site when the path is free', () => {
    const backing = store(null)
    const result = adoptOrCreateSite(backing, {
      path: '/Users/jake/Sites/ebes',
      displayName: 'ebes'
    })

    expect(result.id).not.toBe('existing-id')
    expect(result).toMatchObject({
      path: '/Users/jake/Sites/ebes',
      displayName: 'ebes',
      repoId: null
    })
    expect(backing.upserted).toEqual([result])
  })
})
