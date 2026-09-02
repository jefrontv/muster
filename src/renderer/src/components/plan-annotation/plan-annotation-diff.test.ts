import { describe, expect, it } from 'vitest'
import { unifiedPlanDiff } from './plan-annotation-diff'

describe('unifiedPlanDiff', () => {
  it('is empty when nothing changed, so no edit is reported', () => {
    expect(unifiedPlanDiff('same\ntext', 'same\ntext')).toBe('')
  })

  it('reports a changed line as a removal plus an addition', () => {
    const diff = unifiedPlanDiff('one\ntwo\nthree', 'one\nTWO\nthree')
    expect(diff).toContain('-two')
    expect(diff).toContain('+TWO')
    expect(diff).toContain(' one')
    expect(diff).toContain(' three')
  })

  it('keeps surrounding context so the agent can locate the edit later', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].join('\n')
    const after = ['a', 'b', 'c', 'D', 'e', 'f', 'g'].join('\n')
    const diff = unifiedPlanDiff(before, after)
    // Three lines either side, as git does — enough to re-anchor after the plan moves.
    expect(diff).toContain(' a')
    expect(diff).toContain(' g')
    expect(diff.split('\n').filter((line) => line.startsWith('@@'))).toHaveLength(1)
  })

  it('coalesces nearby edits into one hunk rather than repeating headers', () => {
    const before = ['1', '2', '3', '4', '5'].join('\n')
    const after = ['X', '2', '3', '4', 'Y'].join('\n')
    expect(
      unifiedPlanDiff(before, after)
        .split('\n')
        .filter((l) => l.startsWith('@@'))
    ).toHaveLength(1)
  })

  it('splits distant edits into separate hunks', () => {
    const before = Array.from({ length: 40 }, (_, i) => String(i)).join('\n')
    const after = before.split('\n')
    after[1] = 'changed-early'
    after[38] = 'changed-late'
    const diff = unifiedPlanDiff(before, after.join('\n'))
    expect(diff.split('\n').filter((line) => line.startsWith('@@'))).toHaveLength(2)
  })

  it('handles pure insertion and pure deletion', () => {
    expect(unifiedPlanDiff('a\nb', 'a\nnew\nb')).toContain('+new')
    expect(unifiedPlanDiff('a\ngone\nb', 'a\nb')).toContain('-gone')
  })
})
