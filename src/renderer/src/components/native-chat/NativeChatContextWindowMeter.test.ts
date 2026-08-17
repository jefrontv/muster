import { describe, expect, it } from 'vitest'
import { formatContextTokens } from './NativeChatContextWindowMeter'

describe('formatContextTokens', () => {
  it('shows exact counts under 1000', () => {
    expect(formatContextTokens(0)).toBe('0')
    expect(formatContextTokens(842)).toBe('842')
  })

  it('shows one decimal under 10k', () => {
    expect(formatContextTokens(9_540)).toBe('9.5k')
    expect(formatContextTokens(1_000)).toBe('1k')
    expect(formatContextTokens(2_040)).toBe('2k')
  })

  it('rounds to whole k at 10k and above', () => {
    expect(formatContextTokens(128_400)).toBe('128k')
    expect(formatContextTokens(200_000)).toBe('200k')
  })

  it('clamps negatives to zero', () => {
    expect(formatContextTokens(-5)).toBe('0')
  })

  it('shows M at a million and above', () => {
    expect(formatContextTokens(1_000_000)).toBe('1M')
    expect(formatContextTokens(1_500_000)).toBe('1.5M')
  })
})
