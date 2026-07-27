import { describe, expect, it, vi } from 'vitest'

import { getDefaultPersistedState } from '../../shared/constants'
import type { PersistedState, Project, Repo } from '../../shared/types'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/orca-profile-state-test' } }))

import { rebuildRepoBackedProjectState } from './profile-project-state-file'

const WSL: Project['localWindowsRuntimePreference'] = { kind: 'wsl', distro: 'Ubuntu' }

function repo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    path: '/workspace/orca',
    displayName: 'Orca',
    badgeColor: '#33aa99',
    addedAt: 100,
    kind: 'git',
    connectionId: null,
    ...overrides
  }
}

function stateWith(projects: Project[], repos: Repo[]): PersistedState {
  return { ...getDefaultPersistedState('/Users/tester'), repos, projects }
}

// This rebuild is the profile-side twin of the persistence store's compatibility merge. Both
// re-derive projects from repos, and a field carried by only one survives on this machine and
// vanishes on profile import — the failure mode that looks like it works.
describe('rebuildRepoBackedProjectState', () => {
  it('carries the Windows runtime preference across the rebuild', () => {
    const rebuilt = rebuildRepoBackedProjectState(
      stateWith(
        [
          {
            id: 'repo:repo-1',
            displayName: 'Orca',
            badgeColor: '#33aa99',
            sourceRepoIds: ['repo-1'],
            createdAt: 1,
            updatedAt: 1,
            localWindowsRuntimePreference: WSL
          }
        ],
        [repo()]
      )
    )

    expect(rebuilt.projects).toHaveLength(1)
    expect(rebuilt.projects[0]).toMatchObject({
      id: 'repo:repo-1',
      localWindowsRuntimePreference: WSL
    })
  })

  it('leaves a project with no preference without one', () => {
    const rebuilt = rebuildRepoBackedProjectState(stateWith([], [repo()]))

    expect(rebuilt.projects[0]?.localWindowsRuntimePreference).toBeUndefined()
  })
})
