import { describe, expect, it } from 'vitest'
import {
  nextTypewriterCount,
  typewriterNeedsReset,
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
