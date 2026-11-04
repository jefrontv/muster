import { describe, expect, it } from 'vitest'
import type { Store } from '../persistence'
import { readSiteSetupInfo } from './site-setup-reads'

function store(): Store {
  return {
    getRepos: () => [
      { id: 'r1', path: '/Sites/acme', displayName: 'acme', badgeColor: '', addedAt: 0 },
      {
        id: 'r2',
        path: '/Docs/notes',
        displayName: 'notes',
        badgeColor: '',
        addedAt: 0,
        kind: 'folder',
        executionHostId: 'ssh:box'
      }
    ],
    listSites: () => [{ id: 's1', displayName: 'Acme', repoId: 'r1', path: '/Sites/acme' }]
  } as unknown as Store
}

describe('readSiteSetupInfo', () => {
  it('lists projects with their kind, host and linked site', async () => {
    expect(await readSiteSetupInfo(store(), 'projects', {})).toEqual([
      {
        id: 'r1',
        name: 'acme',
        path: '/Sites/acme',
        kind: 'git',
        host: 'local',
        site: { id: 's1', name: 'Acme' }
      },
      {
        id: 'r2',
        name: 'notes',
        path: '/Docs/notes',
        kind: 'folder',
        host: 'ssh:box',
        site: null
      }
    ])
  })

  it('refuses an unknown clone provider as a caller mistake', async () => {
    await expect(
      readSiteSetupInfo(store(), 'clone-sources', { provider: 'gitlab' })
    ).rejects.toBeInstanceOf(TypeError)
  })

  it('refuses a relative path for stack detection', async () => {
    await expect(readSiteSetupInfo(store(), 'local-stack', { path: 'Sites/acme' })).rejects.toThrow(
      'absolute'
    )
  })

  it('needs a site id for the setup plan', async () => {
    await expect(readSiteSetupInfo(store(), 'setup-plan', {})).rejects.toThrow('siteId')
  })
})
