import { describe, expect, it } from 'vitest'
import { computeRateLimitPace } from './rate-limit-pace'

const HOUR = 3_600_000
const NOW = 1_800_000_000_000
// 5h window, 2.5h elapsed → expected 50%.
const halfway = { windowMinutes: 300, resetsAt: NOW + 2.5 * HOUR }

describe('computeRateLimitPace', () => {
  it('reports reserve and lasts until reset when under pace', () => {
    expect(computeRateLimitPace({ ...halfway, usedPercent: 30 }, NOW)).toEqual({
      status: 'reserve',
      expectedPercent: 50,
      deltaPercent: 20,
      runsOutAt: null
    })
  })

  it('reports deficit with a run-out time when over pace', () => {
    const pace = computeRateLimitPace({ ...halfway, usedPercent: 80 }, NOW)
    expect(pace?.status).toBe('deficit')
    expect(pace?.deltaPercent).toBe(30)
    // 80% in 2.5h → remaining 20% takes 0.625h.
    expect(pace?.runsOutAt).toBe(NOW + 0.625 * HOUR)
  })

  it('treats small drift as on pace', () => {
    expect(computeRateLimitPace({ ...halfway, usedPercent: 51 }, NOW)?.status).toBe('on-pace')
  })

  it('marks an exhausted window as already out', () => {
    expect(computeRateLimitPace({ ...halfway, usedPercent: 100 }, NOW)?.runsOutAt).toBe(NOW)
  })

  it('returns null without a reset time, early in a window, or past reset', () => {
    expect(computeRateLimitPace({ usedPercent: 10, windowMinutes: 300, resetsAt: null }, NOW)).toBe(
      null
    )
    expect(
      computeRateLimitPace({ usedPercent: 1, windowMinutes: 300, resetsAt: NOW + 4.95 * HOUR }, NOW)
    ).toBe(null)
    expect(
      computeRateLimitPace({ usedPercent: 1, windowMinutes: 300, resetsAt: NOW - 1 }, NOW)
    ).toBe(null)
  })
})
