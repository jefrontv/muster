import { describe, expect, it } from 'vitest'
import type { SiteRunLogLine } from '../../../shared/site-run-types'
import { fitLogLinesToByteBudget, MAX_LOG_LINE_CHARS } from './site-mcp-log-window'

function entry(level: SiteRunLogLine['level'], text: string, at = 1): SiteRunLogLine {
  return { at, level, text }
}

describe('fitLogLinesToByteBudget', () => {
  it('clamps individual lines above MAX_LOG_LINE_CHARS and marks truncatedByBytes', () => {
    const windowed = fitLogLinesToByteBudget(
      [entry('info', 'a'.repeat(MAX_LOG_LINE_CHARS + 500))],
      0,
      50_000
    )
    expect(windowed.truncatedByBytes).toBe(true)
    expect(windowed.lines).toHaveLength(1)
    expect(windowed.lines[0]!.text).toContain('… [line truncated]')
    expect(windowed.lines[0]!.text.length).toBeLessThan(MAX_LOG_LINE_CHARS + 50)
  })

  it('keeps the tail within maxBytes, adds dropped count, and recomputes firstErrorIndex', () => {
    const lines = [
      entry('error', `old-error-${'a'.repeat(120)}`, 1),
      entry('info', `middle-${'b'.repeat(120)}`, 2),
      entry('error', 'recent-error', 3),
      entry('info', 'done', 4)
    ]
    const windowed = fitLogLinesToByteBudget(lines, 5, 160)
    expect(windowed.truncatedByBytes).toBe(true)
    expect(windowed.lines.map((item) => item.text)).toEqual(['recent-error', 'done'])
    expect(windowed.truncatedEarlier).toBe(7)
    expect(windowed.firstErrorIndex).toBe(0)
  })

  it('always keeps the newest line even if it alone exceeds maxBytes', () => {
    const windowed = fitLogLinesToByteBudget(
      [entry('info', 'older'), entry('info', 'x'.repeat(200))],
      0,
      10
    )
    expect(windowed.lines).toHaveLength(1)
    expect(windowed.lines[0]!.text).toBe('x'.repeat(200))
    expect(windowed.truncatedEarlier).toBe(1)
    expect(windowed.truncatedByBytes).toBe(true)
  })
})
