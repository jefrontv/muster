// Duration formatting for the native chat timeline: turn-fold labels
// ("Worked for 4m 12s") and the live working timer ("Working for 12s").
// T3 bucket rules: <1s → ms, <10s → tenths, <60s → whole seconds, else m+s.

export function formatNativeChatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return '0ms'
  }
  if (durationMs < 1_000) {
    return `${Math.max(1, Math.round(durationMs))}ms`
  }
  if (durationMs < 10_000) {
    const tenths = Math.round(durationMs / 100) / 10
    // 9.95s+ rounds up to the next bucket — render "10s", not "10.0s".
    return tenths >= 10 ? '10s' : `${tenths.toFixed(1)}s`
  }
  if (durationMs < 60_000) {
    return `${Math.round(durationMs / 1_000)}s`
  }
  let minutes = Math.floor(durationMs / 60_000)
  let seconds = Math.round((durationMs % 60_000) / 1_000)
  if (seconds === 60) {
    minutes += 1
    seconds = 0
  }
  return `${minutes}m ${seconds}s`
}

/** Coarse whole-second elapsed for the self-ticking working timer; tenths
 *  would make the 1s tick look like it's dropping frames. */
export function formatNativeChatWorkingElapsed(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return '0s'
  }
  if (elapsedMs < 60_000) {
    return `${Math.floor(elapsedMs / 1_000)}s`
  }
  const minutes = Math.floor(elapsedMs / 60_000)
  const seconds = Math.floor((elapsedMs % 60_000) / 1_000)
  return `${minutes}m ${seconds}s`
}
