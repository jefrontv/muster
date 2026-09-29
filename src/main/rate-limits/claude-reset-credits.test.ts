import { describe, expect, it } from 'vitest'
import { mapClaudeResetCredits } from './claude-reset-credits'

const NOW = Date.parse('2026-09-27T00:00:00Z')

function grant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'opus55-launch-team-20260921',
    resets_total: 1,
    resets_left: 1,
    starts_at: '2026-09-22T16:00:00+00:00',
    ends_at: '2026-10-22T16:00:00+00:00',
    paused: false,
    ...overrides
  }
}

describe('mapClaudeResetCredits', () => {
  it('maps an available grant to a count and expiry', () => {
    expect(mapClaudeResetCredits({ eligible: true, grants: [grant()] }, NOW)).toEqual({
      availableCount: 1,
      totalEarnedCount: 1,
      nextExpiresAt: Date.parse('2026-10-22T16:00:00Z'),
      credits: [
        {
          status: 'available',
          expiresAt: Date.parse('2026-10-22T16:00:00Z'),
          grantedAt: Date.parse('2026-09-22T16:00:00Z')
        }
      ]
    })
  })

  it('picks the earliest expiry and skips expired or spent grants', () => {
    const result = mapClaudeResetCredits(
      {
        eligible: true,
        grants: [
          grant({ ends_at: '2026-11-01T00:00:00Z', resets_left: 2, resets_total: 2 }),
          grant({ ends_at: '2026-10-05T00:00:00Z' }),
          grant({ ends_at: '2026-09-01T00:00:00Z' }),
          grant({ ends_at: '2026-10-01T00:00:00Z', resets_left: 0 })
        ]
      },
      NOW
    )
    expect(result?.availableCount).toBe(3)
    expect(result?.totalEarnedCount).toBe(5)
    expect(result?.nextExpiresAt).toBe(Date.parse('2026-10-05T00:00:00Z'))
    expect(result?.credits?.map((c) => c.status)).toEqual([
      'available',
      'available',
      'expired',
      'redeemed'
    ])
  })

  it('returns undefined when resets were not evaluated or none exist', () => {
    expect(mapClaudeResetCredits(null, NOW)).toBeUndefined()
    expect(mapClaudeResetCredits(undefined, NOW)).toBeUndefined()
    expect(mapClaudeResetCredits({ eligible: false, grants: [] }, NOW)).toBeUndefined()
  })

  it('returns undefined for a malformed block', () => {
    expect(mapClaudeResetCredits({ grants: [grant()] }, NOW)).toBeUndefined()
    expect(
      mapClaudeResetCredits({ eligible: true, grants: [grant({ resets_left: '1' })] }, NOW)
    ).toBeUndefined()
  })
})
