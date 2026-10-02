// Typewriter pacing for the streaming bubble. Deltas arrive in ~50ms bursts;
// revealing them instantly reads as chunky jumps. Instead the displayed prefix
// chases the accumulated target at an adaptive chars/sec — faster the further
// behind it falls, so it never lags a fast model unboundedly, and it sprints to
// the end once the message is sealed (the transcript swap must not catch a
// half-typed bubble).

/** Reveal tick: each step re-parses markdown once, still fast enough to read as flow. */
export const TYPEWRITER_TICK_MS = 40
/** A word longer than this is revealed mid-word rather than stalling the reveal. */
const MAX_WORD_LOOKAHEAD = 32

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

/** Extends a reveal count to the end of the word it lands in, so text grows by words. */
export function snapToWordBoundary(target: string, count: number): number {
  if (count <= 0 || count >= target.length || /\s/.test(target[count - 1] ?? '')) {
    return Math.max(0, Math.min(count, target.length))
  }
  const limit = Math.min(target.length, count + MAX_WORD_LOOKAHEAD)
  for (let index = count; index < limit; index += 1) {
    if (/\s/.test(target[index] ?? '')) {
      return index
    }
  }
  return limit
}

/** One reveal tick: the paced count, snapped to a word boundary. */
export function nextTypewriterReveal(
  target: string,
  displayed: number,
  dtMs: number,
  settled: boolean
): number {
  return snapToWordBoundary(target, nextTypewriterCount(displayed, target.length, dtMs, settled))
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/

/**
 * Closes a code fence the stream has opened but not yet closed, so a half-streamed
 * block renders as code instead of flashing as prose until its closing fence lands.
 */
export function closeOpenCodeFence(markdown: string): string {
  let open: string | null = null
  for (const line of markdown.split('\n')) {
    const marker = FENCE.exec(line)?.[1]
    if (!marker) {
      continue
    }
    if (open === null) {
      open = marker
    } else if (marker[0] === open[0] && marker.length >= open.length && line.trim() === marker) {
      open = null
    }
  }
  return open === null ? markdown : `${markdown}${markdown.endsWith('\n') ? '' : '\n'}${open}`
}
