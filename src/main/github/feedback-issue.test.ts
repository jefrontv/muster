import { describe, expect, it } from 'vitest'
import { feedbackIssueTitle, truncateIssueBody } from './feedback-issue'

describe('feedbackIssueTitle', () => {
  it('labels the kind and carries the first line', () => {
    expect(feedbackIssueTitle('feedback', 'Sidebar drag is janky')).toBe(
      'Feedback: Sidebar drag is janky'
    )
    expect(feedbackIssueTitle('crash', 'App died opening a worktree')).toBe(
      'Crash report: App died opening a worktree'
    )
  })

  it('never lets a multi-line report break the title', () => {
    expect(feedbackIssueTitle('feedback', 'first line\nsecond line')).toBe('Feedback: first line')
  })

  it('falls back to the bare label when there is no usable first line', () => {
    expect(feedbackIssueTitle('feedback', '   \n\n')).toBe('Feedback')
  })

  it('truncates a long first line so the title stays scannable', () => {
    const title = feedbackIssueTitle('feedback', 'x'.repeat(200))
    expect(title.length).toBeLessThanOrEqual(90)
    expect(title.endsWith('…')).toBe(true)
  })
})

describe('truncateIssueBody', () => {
  it('leaves a body that already fits', () => {
    expect(truncateIssueBody('short body', 100)).toBe('short body')
  })

  it('keeps both ends and cuts the middle', () => {
    const body = `HEAD${'x'.repeat(500)}TAIL`
    const truncated = truncateIssueBody(body, 200)
    expect(truncated.length).toBeLessThanOrEqual(200)
    // The failure is at the head and the newest spans at the tail; both survive.
    expect(truncated.startsWith('HEAD')).toBe(true)
    expect(truncated.endsWith('TAIL')).toBe(true)
    expect(truncated).toContain('characters omitted')
  })
})
