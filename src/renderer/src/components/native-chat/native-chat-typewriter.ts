// Typewriter pacing for the streaming bubble. Deltas arrive in ~50ms bursts;
// revealing them instantly reads as chunky jumps. Instead the displayed prefix
// chases the accumulated target at an adaptive chars/sec — faster the further
// behind it falls, so it never lags a fast model unboundedly, and it sprints to
// the end once the message is sealed (the transcript swap must not catch a
// half-typed bubble).

export const TYPEWRITER_BASE_CPS = 90
export const TYPEWRITER_MAX_CPS = 1_500
/** Backlog multiplier: 40 chars behind ≈ 100cps, 400 behind ≈ 1000cps. */
export const TYPEWRITER_CATCHUP_FACTOR = 2.5
export const TYPEWRITER_SETTLED_MIN_CPS = 600
export const TYPEWRITER_SETTLED_CATCHUP_FACTOR = 6

/** Advance the revealed character count by one animation frame of dtMs. */
export function nextTypewriterCount(
  displayed: number,
  targetLength: number,
  dtMs: number,
  settled: boolean
): number {
  if (displayed >= targetLength) {
    return targetLength
  }
  const remaining = targetLength - displayed
  const cps = settled
    ? Math.max(TYPEWRITER_SETTLED_MIN_CPS, remaining * TYPEWRITER_SETTLED_CATCHUP_FACTOR)
    : Math.min(
        TYPEWRITER_MAX_CPS,
        Math.max(TYPEWRITER_BASE_CPS, remaining * TYPEWRITER_CATCHUP_FACTOR)
      )
  const step = Math.max(1, Math.round((cps * dtMs) / 1000))
  return Math.min(targetLength, displayed + step)
}

/** True when the new target no longer extends what was already revealed —
 *  a different message started and the reveal must restart from zero. */
export function typewriterNeedsReset(
  previousTarget: string | null,
  displayed: number,
  nextTarget: string
): boolean {
  if (previousTarget === null) {
    return true
  }
  const revealed = previousTarget.slice(0, Math.min(displayed, previousTarget.length))
  return !nextTarget.startsWith(revealed)
}
