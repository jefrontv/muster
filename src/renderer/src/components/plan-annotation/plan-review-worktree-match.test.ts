import { describe, expect, it } from 'vitest'
import { matchPlanReviewWorktree } from './plan-review-worktree-match'

const worktrees = [
  { id: 'repo::/work/site', path: '/work/site' },
  { id: 'repo::/work/site/nested', path: '/work/site/nested' },
  { id: 'other::/work/other', path: '/work/other' }
]

describe('matchPlanReviewWorktree', () => {
  it('picks the deepest worktree holding the agent folder', () => {
    expect(
      matchPlanReviewWorktree({ cwd: '/work/site/nested/src', planPath: null }, worktrees)
    ).toBe('repo::/work/site/nested')
  })

  it('falls back to the plan path when the folder matches nothing', () => {
    expect(
      matchPlanReviewWorktree({ cwd: '/elsewhere', planPath: '/work/other/plan.md' }, worktrees)
    ).toBe('other::/work/other')
  })

  it('does not treat a sibling with a shared prefix as inside', () => {
    expect(matchPlanReviewWorktree({ cwd: '/work/site-two', planPath: null }, worktrees)).toBeNull()
  })

  it('returns null with neither path', () => {
    expect(matchPlanReviewWorktree({ cwd: null, planPath: null }, worktrees)).toBeNull()
  })
})
