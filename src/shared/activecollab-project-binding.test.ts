import { describe, expect, it } from 'vitest'

import { normalizeActiveCollabProjectBinding } from './activecollab-project-binding'

describe('normalizeActiveCollabProjectBinding', () => {
  it('accepts a well-formed binding and trims the cached name', () => {
    expect(
      normalizeActiveCollabProjectBinding({
        projectId: 3790,
        projectName: '  Website Rebuild  ',
        boundAt: 1700
      })
    ).toEqual({ projectId: 3790, projectName: 'Website Rebuild', boundAt: 1700 })
  })

  it('defaults a missing or non-finite boundAt instead of rejecting the binding', () => {
    expect(
      normalizeActiveCollabProjectBinding({ projectId: 3790, projectName: 'Website Rebuild' })
    ).toEqual({ projectId: 3790, projectName: 'Website Rebuild', boundAt: 0 })
    expect(
      normalizeActiveCollabProjectBinding({
        projectId: 3790,
        projectName: 'Website Rebuild',
        boundAt: Number.NaN
      })?.boundAt
    ).toBe(0)
  })

  // Each of these would otherwise scope the task list to a project id that cannot match any task,
  // producing a permanently empty list with no error anywhere to explain it.
  it.each([
    ['a non-object', 42],
    ['null', null],
    ['a zero project id', { projectId: 0, projectName: 'Website Rebuild' }],
    ['a negative project id', { projectId: -1, projectName: 'Website Rebuild' }],
    ['a fractional project id', { projectId: 3790.5, projectName: 'Website Rebuild' }],
    ['a stringified project id', { projectId: '3790', projectName: 'Website Rebuild' }],
    ['a missing project id', { projectName: 'Website Rebuild' }],
    ['a blank project name', { projectId: 3790, projectName: '   ' }],
    ['a non-string project name', { projectId: 3790, projectName: 12 }]
  ])('rejects %s', (_label, value) => {
    expect(normalizeActiveCollabProjectBinding(value)).toBeNull()
  })
})
