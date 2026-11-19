import type { ClaudeStatusLineRateLimits } from '../../shared/claude-statusline-rate-limits'

export function parseClaudeStreamQuota(
  message: Record<string, unknown>,
  configDir: string | null,
  now = Date.now()
): ClaudeStatusLineRateLimits | null {
  if (message.type !== 'rate_limit_event' || !message.rate_limit_info) {
    return null
  }
  const { utilization, resetsAt, rateLimitType } = message.rate_limit_info as {
    utilization?: unknown
    resetsAt?: unknown
    rateLimitType?: unknown
  }
  if (
    (rateLimitType !== 'five_hour' && rateLimitType !== 'seven_day') ||
    typeof utilization !== 'number' ||
    !Number.isFinite(utilization) ||
    utilization < 0 ||
    typeof resetsAt !== 'number' ||
    !Number.isFinite(resetsAt) ||
    resetsAt * 1000 <= now
  ) {
    return null
  }
  const window = { used_percentage: Math.min(utilization, 1) * 100, resets_at: resetsAt }
  return {
    configDir,
    fiveHour: rateLimitType === 'five_hour' ? window : null,
    sevenDay: rateLimitType === 'seven_day' ? window : null
  }
}
