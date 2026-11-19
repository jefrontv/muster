import { describe, expect, it } from 'vitest'
import { parseClaudeStreamQuota } from './claude-stream-quota'

describe('Claude stream quota', () => {
  const now = Date.parse('2026-11-19T12:00:00Z')
  const resetsAt = now / 1000 + 60

  it('maps subscription windows independently', () => {
    const message = {
      type: 'rate_limit_event',
      rate_limit_info: { utilization: 0.42, resetsAt, rateLimitType: 'seven_day' }
    }
    expect(parseClaudeStreamQuota(message, '/account', now)).toEqual({
      configDir: '/account',
      fiveHour: null,
      sevenDay: { used_percentage: 42, resets_at: resetsAt }
    })
  })

  it('ignores events without percentages and expired windows', () => {
    for (const rate_limit_info of [
      { resetsAt, rateLimitType: 'five_hour' },
      { utilization: 0.42, resetsAt: now / 1000, rateLimitType: 'five_hour' }
    ]) {
      expect(
        parseClaudeStreamQuota({ type: 'rate_limit_event', rate_limit_info }, null, now)
      ).toBeNull()
    }
  })
})
