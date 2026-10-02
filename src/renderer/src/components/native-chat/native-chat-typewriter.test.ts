import { describe, expect, it } from 'vitest'
import {
  closeOpenCodeFence,
  nextTypewriterCount,
  nextTypewriterReveal,
  snapToWordBoundary,
  typewriterNeedsReset,
  TYPEWRITER_TICK_MS,
  TYPEWRITER_BASE_CPS,
  TYPEWRITER_MAX_CPS
} from './native-chat-typewriter'

describe('nextTypewriterCount', () => {
  it('advances at the base rate when barely behind', () => {
    // 16ms frame at 90cps ≈ 1-2 chars.
    const next = nextTypewriterCount(0, 10, 16, false)
    expect(next).toBeGreaterThanOrEqual(1)
    expect(next).toBeLessThanOrEqual(3)
  })

  it('accelerates proportionally to the backlog', () => {
    const smallBacklog = nextTypewriterCount(0, 50, 16, false)
    const bigBacklog = nextTypewriterCount(0, 500, 16, false)
    expect(bigBacklog).toBeGreaterThan(smallBacklog)
  })

  it('caps the live rate at TYPEWRITER_MAX_CPS', () => {
    const next = nextTypewriterCount(0, 100_000, 1000, false)
    expect(next).toBe(TYPEWRITER_MAX_CPS)
  })

  it('never overshoots the target', () => {
    expect(nextTypewriterCount(8, 10, 5000, false)).toBe(10)
    expect(nextTypewriterCount(10, 10, 16, false)).toBe(10)
  })

  it('sprints when settled', () => {
    const live = nextTypewriterCount(0, 200, 16, false)
    const settled = nextTypewriterCount(0, 200, 16, true)
    expect(settled).toBeGreaterThan(live)
  })

  it('always advances at least one character per frame', () => {
    expect(nextTypewriterCount(0, 10, 0.1, false)).toBe(1)
  })

  it('base rate constant sanity', () => {
    // 1s frame from zero backlog-dominated: min rate applies.
    expect(nextTypewriterCount(0, TYPEWRITER_BASE_CPS, 1000, false)).toBe(TYPEWRITER_BASE_CPS)
  })
})

describe('typewriterNeedsReset', () => {
  it('resets on first target', () => {
    expect(typewriterNeedsReset(null, 0, 'hello')).toBe(true)
  })

  it('keeps position when the target extends the revealed prefix', () => {
    expect(typewriterNeedsReset('hel', 3, 'hello world')).toBe(false)
  })

  it('resets when a new message replaces the old target', () => {
    expect(typewriterNeedsReset('first answer', 8, 'second answer')).toBe(true)
  })

  it('tolerates a target shorter than the displayed count', () => {
    expect(typewriterNeedsReset('hi', 10, 'hi there')).toBe(false)
  })
})

describe('snapToWordBoundary / nextTypewriterReveal', () => {
  it('extends a mid-word count to the end of that word', () => {
    expect(snapToWordBoundary('Hello there friend', 2)).toBe(5)
    expect(snapToWordBoundary('Hello there friend', 6)).toBe(6)
    expect(snapToWordBoundary('Hello', 2)).toBe(5)
  })

  it('does not stall on a very long token', () => {
    const long = `${'x'.repeat(100)} y`
    expect(snapToWordBoundary(long, 1)).toBe(33)
  })

  it('reveals whole words per tick and reaches the end', () => {
    const target = 'one two three four'
    const first = nextTypewriterReveal(target, 0, TYPEWRITER_TICK_MS, false)
    expect(target.slice(0, first)).toMatch(/^\w+\s?$/)
    let shown = 0
    for (let i = 0; i < 200 && shown < target.length; i += 1) {
      shown = nextTypewriterReveal(target, shown, TYPEWRITER_TICK_MS, false)
    }
    expect(shown).toBe(target.length)
  })
})

describe('closeOpenCodeFence', () => {
  it('closes a fence the stream has not closed yet', () => {
    expect(closeOpenCodeFence('Here:\n```ts\nconst a = 1')).toBe('Here:\n```ts\nconst a = 1\n```')
    expect(closeOpenCodeFence('~~~~\nx\n')).toBe('~~~~\nx\n~~~~')
  })

  it('leaves balanced and fence-free text alone', () => {
    expect(closeOpenCodeFence('```\na\n```\nafter')).toBe('```\na\n```\nafter')
    expect(closeOpenCodeFence('no code here')).toBe('no code here')
  })

  it('needs a matching closer, not an inner shorter fence', () => {
    expect(closeOpenCodeFence('````md\n```\ninner\n```')).toBe('````md\n```\ninner\n```\n````')
  })
})
