import { describe, expect, it } from 'vitest'
import { planPageTitle, restoreTitleHeading, stripTitleHeading } from './plan-page-heading'

const PLAN = '# Tab strip polish\n\n## Goal\n\nKeep tabs still.\n'

describe('plan page heading', () => {
  it('names the page from the H1 unless the caller gave a real title', () => {
    expect(planPageTitle('plan.md', PLAN)).toBe('Tab strip polish')
    expect(planPageTitle('Plan', PLAN)).toBe('Tab strip polish')
    expect(planPageTitle('Ship plan', PLAN)).toBe('Ship plan')
    expect(planPageTitle('plan.md', 'no heading')).toBe('plan.md')
  })

  it('drops only an H1 that repeats the title, ignoring case and spaces', () => {
    expect(stripTitleHeading(PLAN, ' tab STRIP polish ')).toBe('## Goal\n\nKeep tabs still.\n')
    expect(stripTitleHeading(PLAN, 'Other')).toBe(PLAN)
    expect(stripTitleHeading('## Goal\n', 'Goal')).toBe('## Goal\n')
  })

  it('puts the H1 back so the page round-trips to the plan', () => {
    const body = stripTitleHeading(PLAN, 'Tab strip polish')
    expect(restoreTitleHeading(body, PLAN)).toBe(PLAN)
    expect(restoreTitleHeading(PLAN, PLAN)).toBe(PLAN)
    expect(restoreTitleHeading('body', 'no heading')).toBe('body')
  })
})
