// Why: pure so the desktop popup and mobile can share pace math.

export type RateLimitPaceStatus = 'reserve' | 'deficit' | 'on-pace'

export type RateLimitPace = {
  status: RateLimitPaceStatus
  /** Percent of the window that would be used by now at an even burn rate (0–100). */
  expectedPercent: number
  /** |expected − used| in whole percentage points. */
  deltaPercent: number
  /** Unix ms when usage hits 100% at the current burn rate; null if it lasts until reset. */
  runsOutAt: number | null
}

// Why: a couple of points either way is noise, not a trend worth flagging.
const ON_PACE_TOLERANCE = 2
// Why: extrapolating from the first few minutes of a window swings wildly.
const MIN_ELAPSED_FRACTION = 0.03

export function computeRateLimitPace(
  window: { usedPercent: number; windowMinutes: number; resetsAt: number | null },
  now: number = Date.now()
): RateLimitPace | null {
  const { usedPercent, windowMinutes, resetsAt } = window
  if (resetsAt == null || !Number.isFinite(usedPercent) || windowMinutes <= 0) {
    return null
  }
  const durationMs = windowMinutes * 60_000
  const remainingMs = resetsAt - now
  if (remainingMs <= 0 || remainingMs > durationMs) {
    return null
  }
  const elapsedMs = durationMs - remainingMs
  const elapsedFraction = elapsedMs / durationMs
  if (elapsedFraction < MIN_ELAPSED_FRACTION) {
    return null
  }

  const used = Math.min(100, Math.max(0, usedPercent))
  const expected = elapsedFraction * 100
  const delta = expected - used
  const status: RateLimitPaceStatus =
    Math.abs(delta) <= ON_PACE_TOLERANCE ? 'on-pace' : delta > 0 ? 'reserve' : 'deficit'

  let runsOutAt: number | null = null
  if (used >= 100) {
    runsOutAt = now
  } else if (used > 0) {
    const msToFull = ((100 - used) / used) * elapsedMs
    runsOutAt = msToFull < remainingMs ? now + msToFull : null
  }

  return {
    status,
    expectedPercent: Math.round(expected),
    deltaPercent: Math.round(Math.abs(delta)),
    runsOutAt
  }
}
