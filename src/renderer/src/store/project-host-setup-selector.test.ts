import { describe, expect, it, vi } from 'vitest'
import type * as NormalizationModule from './project-host-setup-selector-normalization'
import type { Project, ProjectHostSetup, Repo } from '../../../shared/types'
import { getProjectHostSetupProjectionFromState } from './project-host-setup-selector'

const normalizeSpy = vi.hoisted(() => vi.fn())

vi.mock('./project-host-setup-selector-normalization', async (importOriginal) => {
  const actual = await importOriginal<typeof NormalizationModule>()
  normalizeSpy.mockImplementation(actual.normalizeHydratedProjectHostSetupProjection)
  return { normalizeHydratedProjectHostSetupProjection: normalizeSpy }
})

function makeState(): {
  repos: Repo[]
  projects: Project[]
  projectHostSetups: ProjectHostSetup[]
} {
  return {
    repos: [
      {
        id: 'repo-1',
        path: '/Users/alice/orca',
        displayName: 'orca',
        badgeColor: '#737373',
        addedAt: 100,
        kind: 'git'
      }
    ],
    projects: [
      {
        id: 'project-1',
        displayName: 'Project',
        badgeColor: '#737373',
        sourceRepoIds: ['repo-1'],
        createdAt: 1,
        updatedAt: 1
      }
    ],
    projectHostSetups: [
      {
        id: 'setup-1',
        projectId: 'project-1',
        hostId: 'local',
        repoId: 'repo-1',
        path: '/Users/alice/orca',
        displayName: 'orca',
        setupState: 'ready',
        setupMethod: 'legacy-repo',
        createdAt: 1,
        updatedAt: 1
      }
    ]
  }
}

describe('getProjectHostSetupProjectionFromState cache', () => {
  it('skips normalization when repos, projects and setups are unchanged', () => {
    const state = makeState()
    normalizeSpy.mockClear()

    const first = getProjectHostSetupProjectionFromState(state)
    // Unrelated store writes produce a new state object with the same slices.
    const second = getProjectHostSetupProjectionFromState({ ...state })

    expect(second).toBe(first)
    expect(normalizeSpy).toHaveBeenCalledTimes(1)
  })

  it('recomputes when any input slice changes identity', () => {
    const state = makeState()
    normalizeSpy.mockClear()

    getProjectHostSetupProjectionFromState(state)
    getProjectHostSetupProjectionFromState({ ...state, repos: [...state.repos] })
    getProjectHostSetupProjectionFromState({ ...state, projects: [...state.projects] })
    getProjectHostSetupProjectionFromState({
      ...state,
      projectHostSetups: [...state.projectHostSetups]
    })

    expect(normalizeSpy).toHaveBeenCalledTimes(4)
  })
})
