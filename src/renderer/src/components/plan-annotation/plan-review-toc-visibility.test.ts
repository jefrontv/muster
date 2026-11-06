import { describe, expect, it } from 'vitest'
import {
  PLAN_REVIEW_TOC_MIN_MODAL_WIDTH,
  shouldShowPlanReviewTableOfContents
} from './plan-review-toc-visibility'

const wide = PLAN_REVIEW_TOC_MIN_MODAL_WIDTH
const narrow = PLAN_REVIEW_TOC_MIN_MODAL_WIDTH - 1

describe('plan review table of contents visibility', () => {
  it('shows the outline when the window has room for it', () => {
    expect(
      shouldShowPlanReviewTableOfContents({ hasOutline: true, modalWidth: wide, userChoice: null })
    ).toBe(true)
  })

  it('collapses the outline in a narrow window', () => {
    expect(
      shouldShowPlanReviewTableOfContents({
        hasOutline: true,
        modalWidth: narrow,
        userChoice: null
      })
    ).toBe(false)
  })

  it('stays closed until the window is measured', () => {
    expect(
      shouldShowPlanReviewTableOfContents({ hasOutline: true, modalWidth: null, userChoice: null })
    ).toBe(false)
  })

  it('never opens an empty outline', () => {
    expect(
      shouldShowPlanReviewTableOfContents({ hasOutline: false, modalWidth: wide, userChoice: null })
    ).toBe(false)
  })

  it('keeps an outline the user opened in a narrow window', () => {
    expect(
      shouldShowPlanReviewTableOfContents({
        hasOutline: true,
        modalWidth: narrow,
        userChoice: true
      })
    ).toBe(true)
  })

  it('keeps an outline the user closed in a wide window', () => {
    expect(
      shouldShowPlanReviewTableOfContents({ hasOutline: true, modalWidth: wide, userChoice: false })
    ).toBe(false)
  })
})
