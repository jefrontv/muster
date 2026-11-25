import { describe, expect, it } from 'vitest'
import { planReviewOnScreen, worktreeShowsPlanReview } from './plan-review-visibility'

const base = {
  dialog: false,
  worktreeId: 'muster::/sites/muster-ui',
  activeView: 'terminal',
  activeWorktreeId: 'muster::/sites/muster-ui',
  windowFocused: true
}

describe('planReviewOnScreen', () => {
  it('counts a tab in the project in front of the user', () => {
    expect(planReviewOnScreen(base)).toBe(true)
  })

  it('treats another project, the Bots view or a blurred window as off screen', () => {
    expect(planReviewOnScreen({ ...base, activeWorktreeId: 'pages::/sites/muster-ui-pages' })).toBe(
      false
    )
    expect(planReviewOnScreen({ ...base, activeView: 'bots' })).toBe(false)
    expect(planReviewOnScreen({ ...base, windowFocused: false })).toBe(false)
  })

  it('counts the popup as on screen from any view', () => {
    expect(planReviewOnScreen({ ...base, dialog: true, activeView: 'chat' })).toBe(true)
  })
})

describe('worktreeShowsPlanReview', () => {
  it('is false when no tab in the worktree carries the review mark', () => {
    expect(worktreeShowsPlanReview({ w: [{ attention: null }] }, 'w')).toBe(false)
    expect(worktreeShowsPlanReview({}, 'w')).toBe(false)
    expect(worktreeShowsPlanReview({ w: [{ attention: 'review' }] }, 'w')).toBe(true)
  })
})
