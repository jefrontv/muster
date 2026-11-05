import { describe, expect, it } from 'vitest'
import type { Project, Repo } from '../shared/types'
import { omitProjectedProjectIcons } from './project-icon-persistence'

const repo = (overrides: Partial<Repo> = {}): Repo => ({
  id: 'r1',
  path: '/repo',
  displayName: 'Repo',
  badgeColor: '#fff',
  addedAt: 1,
  ...overrides
})

const project = (overrides: Partial<Project> = {}): Project => ({
  id: 'repo:r1',
  displayName: 'Repo',
  badgeColor: '#fff',
  sourceRepoIds: ['r1'],
  createdAt: 1,
  updatedAt: 1,
  ...overrides
})

const image = (src: string) => ({ type: 'image' as const, source: 'upload' as const, src })

describe('omitProjectedProjectIcons', () => {
  it('drops an icon that matches the first source repo, even as a separate copy', () => {
    const result = omitProjectedProjectIcons(
      [project({ repoIcon: image('data:image/png;base64,AA==') })],
      [repo({ repoIcon: image('data:image/png;base64,AA==') })]
    )
    expect(result[0]).not.toHaveProperty('repoIcon')
  })

  it('keeps icons that differ from the repo or belong to another project id', () => {
    const repos = [repo({ repoIcon: image('data:image/png;base64,AA==') })]
    const result = omitProjectedProjectIcons(
      [
        project({ repoIcon: image('data:image/png;base64,BB==') }),
        project({ id: 'cloud', repoIcon: image('data:image/png;base64,AA==') }),
        project({
          id: 'repo:gone',
          sourceRepoIds: ['gone'],
          repoIcon: { type: 'emoji', emoji: 'x' }
        })
      ],
      repos
    )
    expect(result.map((entry) => entry.repoIcon !== undefined)).toEqual([true, true, true])
  })

  it('drops a null icon cleared on both repo and project', () => {
    const result = omitProjectedProjectIcons(
      [project({ repoIcon: null })],
      [repo({ repoIcon: null })]
    )
    expect(result[0]).not.toHaveProperty('repoIcon')
  })
})
