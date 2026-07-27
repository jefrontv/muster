import { describe, expect, it } from 'vitest'

import { carryProjectUserOwnedFields } from './project-user-owned-fields'
import type { Project } from './types'

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'repo:r1',
    displayName: 'Repo',
    badgeColor: '#737373',
    sourceRepoIds: ['r1'],
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

const BINDING = { projectId: 3790, projectName: 'Website Rebuild', boundAt: 1700 }

describe('carryProjectUserOwnedFields', () => {
  it('carries the ActiveCollab binding onto the freshly projected project', () => {
    const carried = carryProjectUserOwnedFields(
      project({ updatedAt: 5 }),
      project({ activeCollabBinding: BINDING, updatedAt: 9 })
    )

    expect(carried.activeCollabBinding).toEqual(BINDING)
    // The projection's timestamp would otherwise roll the user's later edit backwards.
    expect(carried.updatedAt).toBe(9)
  })

  it('carries the binding and the runtime preference together', () => {
    const carried = carryProjectUserOwnedFields(
      project(),
      project({
        activeCollabBinding: BINDING,
        localWindowsRuntimePreference: { kind: 'wsl', distro: 'Ubuntu' }
      })
    )

    expect(carried.activeCollabBinding).toEqual(BINDING)
    expect(carried.localWindowsRuntimePreference).toEqual({ kind: 'wsl', distro: 'Ubuntu' })
  })

  it('keeps projected values when the prior record carried nothing the user owned', () => {
    const projected = project()

    expect(carryProjectUserOwnedFields(projected, project())).toBe(projected)
    expect(carryProjectUserOwnedFields(projected, undefined)).toBe(projected)
  })

  it('does not resurrect a binding the projection dropped when the prior record had none', () => {
    expect(
      carryProjectUserOwnedFields(project({ activeCollabBinding: BINDING }), project())
        .activeCollabBinding
    ).toEqual(BINDING)
    expect(carryProjectUserOwnedFields(project(), project()).activeCollabBinding).toBeUndefined()
  })
})
