import type { ProviderRateLimits } from '../../shared/rate-limit-types'

type RateLimitResetCredits = NonNullable<ProviderRateLimits['rateLimitResetCredits']>

type CedarGrant = {
  resets_left?: unknown
  resets_total?: unknown
  starts_at?: unknown
  ends_at?: unknown
  paused?: unknown
}

type CedarStatus = {
  eligible?: unknown
  grants?: unknown
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null
  }
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/**
 * Map the `cedar_ember` block of `/api/oauth/usage?cedar_ember=1` to reset credits.
 * Why: a null block means the server did not evaluate resets, not that there are none.
 */
export function mapClaudeResetCredits(
  raw: unknown,
  now = Date.now()
): RateLimitResetCredits | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined
  }
  const status = raw as CedarStatus
  // Why: most accounts have no grants; hide the row instead of showing "0 resets".
  if (
    typeof status.eligible !== 'boolean' ||
    !Array.isArray(status.grants) ||
    status.grants.length === 0
  ) {
    return undefined
  }

  let availableCount = 0
  let totalEarnedCount = 0
  let nextExpiresAt: number | null = null
  const credits: NonNullable<RateLimitResetCredits['credits']> = []

  for (const entry of status.grants as CedarGrant[]) {
    if (!entry || typeof entry !== 'object' || !isCount(entry.resets_left)) {
      return undefined
    }
    const left = entry.resets_left
    const expiresAt = parseTimestamp(entry.ends_at)
    const expired = expiresAt !== null && expiresAt <= now
    totalEarnedCount += isCount(entry.resets_total) ? entry.resets_total : left
    if (!expired && left > 0) {
      availableCount += left
      if (expiresAt !== null && (nextExpiresAt === null || expiresAt < nextExpiresAt)) {
        nextExpiresAt = expiresAt
      }
    }
    credits.push({
      status: expired
        ? 'expired'
        : left === 0
          ? 'redeemed'
          : entry.paused === true
            ? 'paused'
            : 'available',
      expiresAt,
      grantedAt: parseTimestamp(entry.starts_at)
    })
  }

  return { availableCount, totalEarnedCount, nextExpiresAt, credits }
}
