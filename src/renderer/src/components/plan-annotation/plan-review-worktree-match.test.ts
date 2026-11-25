import { describe, expect, it } from 'vitest'
import { matchPlanReviewWorktree, planReviewWorktree } from './plan-review-worktree-match'

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
describe('planReviewWorktree', () => {
  const projects = [
    { id: 'muster::/sites/muster-ui', path: '/sites/muster-ui', repoId: 'muster' },
    { id: 'pages::/sites/muster-ui-pages', path: '/sites/muster-ui-pages', repoId: 'pages' }
  ]

  it('opens in the agent folder project, not the project holding the plan or page', () => {
    const request = {
      cwd: '/sites/muster-ui',
      planPath: '/sites/muster-ui-pages/docs/plan.md',
      page: { scopeKey: 'repo:pages', pageId: 'p1' }
    }
    expect(planReviewWorktree(request, projects, true)).toBe('muster::/sites/muster-ui')
  })

  it('uses the page project when the agent folder matches nothing', () => {
    const request = { cwd: '/tmp', planPath: null, page: { scopeKey: 'repo:pages', pageId: 'p1' } }
    expect(planReviewWorktree(request, projects, true)).toBe('pages::/sites/muster-ui-pages')
  })

  it('falls back to the plan file last', () => {
    const request = { cwd: '/tmp', planPath: '/sites/muster-ui-pages/plan.md', page: null }
    expect(planReviewWorktree(request, projects, false)).toBe('pages::/sites/muster-ui-pages')
  })
})
