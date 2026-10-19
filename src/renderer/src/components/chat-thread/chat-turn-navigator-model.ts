// Turn navigator geometry: which turn is in view, and which ticks to render.

export const TICK_PX = 10
const TICK_OVERSCAN = 6

/**
 * The last turn whose top has passed a line a third of the way down the visible
 * band. At the very end it is the last turn, even a short one that never reaches the line.
 */
export function activeTurnIndex(
  tops: number[],
  scrollTop: number,
  bandHeight: number,
  atEnd = false
): number {
  if (atEnd && tops.length > 0) {
    return tops.length - 1
  }
  const line = scrollTop + bandHeight / 3
  let active = 0
  for (let index = 0; index < tops.length; index++) {
    if (tops[index]! > line) {
      break
    }
    active = index
  }
  return active
}

/** Ticks inside the rail's scrolled viewport, plus a few either side. */
export function tickWindow(
  railScrollTop: number,
  railHeight: number,
  count: number
): { start: number; end: number } {
  const start = Math.max(0, Math.floor(railScrollTop / TICK_PX) - TICK_OVERSCAN)
  const end = Math.min(count, Math.ceil((railScrollTop + railHeight) / TICK_PX) + TICK_OVERSCAN)
  return { start, end }
}

/** Rail scrollTop that brings a tick into view, or null when it already is. */
export function railScrollFor(
  index: number,
  railScrollTop: number,
  railHeight: number
): number | null {
  const top = index * TICK_PX
  if (top < railScrollTop) {
    return top
  }
  if (top + TICK_PX > railScrollTop + railHeight) {
    return top + TICK_PX - railHeight
  }
  return null
}
