import { describe, expect, it } from 'vitest'
import type { ActiveCollabProject } from '../../../shared/activecollab-types'
import { openActiveCollabProjects } from './activecollab-project-picker'

function project(overrides: Partial<ActiveCollabProject> = {}): ActiveCollabProject {
  return {
    id: 1,
    name: 'Muster UI',
    isCompleted: false,
    openTaskCount: 3,
    ...overrides
  }
}

describe('openActiveCollabProjects', () => {
  it('drops completed projects and excluded ids', () => {
    expect(
      openActiveCollabProjects(
        [
          project({ id: 1, name: 'Open' }),
          project({ id: 2, name: 'Done', isCompleted: true }),
          project({ id: 3, name: 'Taken' })
        ],
        new Set([3])
      ).map((item) => item.id)
    ).toEqual([1])
  })

  it('treats a null catalog as empty', () => {
    expect(openActiveCollabProjects(null)).toEqual([])
  })
})
