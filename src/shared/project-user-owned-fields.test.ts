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

const WSL: Project['localWindowsRuntimePreference'] = { kind: 'wsl', distro: 'Ubuntu' }

describe('carryProjectUserOwnedFields', () => {
  it('carries the runtime preference onto the freshly projected project', () => {
    const carried = carryProjectUserOwnedFields(
      project({ updatedAt: 5 }),
      project({ localWindowsRuntimePreference: WSL, updatedAt: 9 })
    )

    expect(carried.localWindowsRuntimePreference).toEqual(WSL)
    // The projection's timestamp would otherwise roll the user's later edit backwards.
    expect(carried.updatedAt).toBe(9)
  })

  it('keeps projected values when the prior record carried nothing the user owned', () => {
    const projected = project()

    expect(carryProjectUserOwnedFields(projected, project())).toBe(projected)
    expect(carryProjectUserOwnedFields(projected, undefined)).toBe(projected)
  })

  it('does not blank a projected preference when the prior record had none', () => {
    expect(
      carryProjectUserOwnedFields(project({ localWindowsRuntimePreference: WSL }), project())
        .localWindowsRuntimePreference
    ).toEqual(WSL)
    expect(
      carryProjectUserOwnedFields(project(), project()).localWindowsRuntimePreference
    ).toBeUndefined()
  })
})
