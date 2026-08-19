// Pure decisions for the native chat timeline's three-mode scroll model
// (T3-style): 'following-end' pins to the live edge, 'anchoring-new-turn'
// holds a just-sent user message near the viewport top while the reply grows
// below, 'free-scrolling' leaves the user alone. The component owns the DOM
// and imperative scrolls; this module owns only the decisions so they can be
// unit-tested without a scroll container.

/** A scroll container's geometry. Mirrors the three DOM props we read so tests
 *  can pass plain numbers instead of a fake element. */
export type ScrollGeometry = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export type NativeChatScrollMode = 'following-end' | 'anchoring-new-turn' | 'free-scrolling'

/** Follow re-arm band above the hard bottom. Strict (40px, matching T3) so
 *  live-follow can't re-arm while the user is reading history and yank them
 *  back down on the next stream chunk. */
export const NATIVE_CHAT_FOLLOW_REARM_BAND_PX = 40

/** Gap kept between the viewport top and an anchored user message. Roomy
 *  enough that a fresh send doesn't read as pinned against the header. */
export const NATIVE_CHAT_ANCHOR_TOP_OFFSET_PX = 40

/** Debounce before the "jump to latest" pill appears; hiding is instant. */
export const NATIVE_CHAT_JUMP_SHOW_DEBOUNCE_MS = 150

/** Reveal scrolls below this are layout jitter, not real live-edge growth. */
export const NATIVE_CHAT_MIN_REVEAL_DELTA_PX = 1

/** Expand/collapse compensation below this is sub-pixel noise. */
export const NATIVE_CHAT_MIN_TOGGLE_COMPENSATION_PX = 0.5

/** The gestures that can deliberately carry the viewport away from the end. */
export type NativeChatScrollGesture =
  | 'wheel-up'
  | 'scroll-key'
  | 'pointer-scrollbar'
  | 'pointer-content'

/** Distance in px from the bottom edge of the scroll range. */
export function distanceFromEnd(geometry: ScrollGeometry): number {
  return Math.max(0, geometry.scrollHeight - geometry.clientHeight - geometry.scrollTop)
}

/** Underflowing content can't scroll at all, so nothing there breaks follow. */
export function contentOverflows(geometry: ScrollGeometry): boolean {
  return geometry.scrollHeight > geometry.clientHeight
}

export function isWithinFollowRearmBand(
  geometry: ScrollGeometry,
  band: number = NATIVE_CHAT_FOLLOW_REARM_BAND_PX
): boolean {
  return distanceFromEnd(geometry) <= band
}

/**
 * Mode after a scroll event. Anchoring is sticky here: its reveal scrolls are
 * programmatic and must neither re-arm follow nor break to free-scrolling —
 * only a user gesture or the turn settling moves it. Otherwise the re-arm
 * band decides: inside it the user has returned to the live edge.
 */
export function resolveModeAfterScroll(
  mode: NativeChatScrollMode,
  geometry: ScrollGeometry,
  band: number = NATIVE_CHAT_FOLLOW_REARM_BAND_PX
): NativeChatScrollMode {
  if (mode === 'anchoring-new-turn') {
    return mode
  }
  return isWithinFollowRearmBand(geometry, band) ? 'following-end' : 'free-scrolling'
}

/**
 * Mode after a deliberate navigation gesture. Wheel-up, scroll keys, and
 * scrollbar grabs break follow whenever the content can actually scroll;
 * content clicks break only away from the end band (reading or selecting up
 * there must hold position, clicking near the live edge keeps following).
 */
export function resolveModeAfterGesture(
  mode: NativeChatScrollMode,
  gesture: NativeChatScrollGesture,
  geometry: ScrollGeometry,
  band: number = NATIVE_CHAT_FOLLOW_REARM_BAND_PX
): NativeChatScrollMode {
  if (gesture === 'pointer-content') {
    return isWithinFollowRearmBand(geometry, band) ? mode : 'free-scrolling'
  }
  return contentOverflows(geometry) ? 'free-scrolling' : mode
}

/** Anchoring ends with the turn: hand off to follow when the viewport is at
 *  the live edge, otherwise leave the user where they are. */
export function resolveModeAfterTurnSettled(
  mode: NativeChatScrollMode,
  geometry: ScrollGeometry,
  band: number = NATIVE_CHAT_FOLLOW_REARM_BAND_PX
): NativeChatScrollMode {
  if (mode !== 'anchoring-new-turn') {
    return mode
  }
  return isWithinFollowRearmBand(geometry, band) ? 'following-end' : 'free-scrolling'
}

/** The "jump to latest" pill shows only while free-scrolling away from the
 *  end with content actually below the viewport. */
export function shouldShowJumpToLatest(
  mode: NativeChatScrollMode,
  geometry: ScrollGeometry,
  band: number = NATIVE_CHAT_FOLLOW_REARM_BAND_PX
): boolean {
  return mode === 'free-scrolling' && contentOverflows(geometry) && distanceFromEnd(geometry) > band
}

/**
 * Height of the end spacer that lets a just-sent user message sit at the
 * viewport top while the reply streams into the reserved space below. Shrinks
 * to zero as real content fills the viewport, keeping the scroll height (and
 * therefore the anchored viewport) still until the turn overflows.
 */
export function resolveAnchorSpacerPx(input: {
  viewportHeight: number
  /** Anchor row's top, measured from the top of the scroll content. */
  anchorTop: number
  /** Content height excluding any currently applied spacer. */
  contentHeightWithoutSpacer: number
  anchorOffset?: number
}): number {
  const offset = input.anchorOffset ?? NATIVE_CHAT_ANCHOR_TOP_OFFSET_PX
  const belowAnchor = input.contentHeightWithoutSpacer - input.anchorTop
  return Math.max(0, Math.round(input.viewportHeight - offset - belowAnchor))
}

/**
 * Minimal scroll needed to keep an anchored turn's growing live edge revealed
 * (T3 getAnchoredTurnMetrics idea). Zero while the edge is already visible or
 * the growth is within layout jitter.
 */
export function resolveRevealDelta(input: {
  scrollTop: number
  viewportHeight: number
  /** Real content bottom in scroll coordinates (scrollHeight minus spacer). */
  contentBottom: number
}): number {
  const raw = input.contentBottom - (input.scrollTop + input.viewportHeight)
  return raw > NATIVE_CHAT_MIN_REVEAL_DELTA_PX ? raw : 0
}

/**
 * Spacer to keep once a turn stops reserving space, so the viewport does not
 * move at all. Zero when real content already reaches past the viewport bottom;
 * otherwise exactly the shortfall.
 *
 * Why keep any: dropping the whole reserve collapsed the content by up to a
 * viewport, and the browser's scrollTop clamp read as the timeline bouncing to
 * the bottom the instant a short reply landed.
 */
export function resolveRetainedSpacerPx(input: {
  scrollTop: number
  viewportHeight: number
  /** Real content bottom in scroll coordinates (scrollHeight minus spacer). */
  contentBottom: number
}): number {
  return Math.max(0, Math.round(input.scrollTop + input.viewportHeight - input.contentBottom))
}

/** ScrollTop correction that keeps a toggled element visually still after its
 *  expand/collapse re-layout; zero when the shift is sub-pixel noise. */
export function resolveToggleCompensation(previousTop: number, currentTop: number): number {
  const delta = currentTop - previousTop
  return Math.abs(delta) >= NATIVE_CHAT_MIN_TOGGLE_COMPENSATION_PX ? delta : 0
}
