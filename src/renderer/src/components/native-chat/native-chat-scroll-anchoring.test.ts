import { describe, it, expect } from 'vitest'
import {
  contentOverflows,
  distanceFromEnd,
  isWithinFollowRearmBand,
  NATIVE_CHAT_FOLLOW_REARM_BAND_PX,
  resolveAnchorSpacerPx,
  resolveModeAfterGesture,
  resolveModeAfterScroll,
  resolveModeAfterTurnSettled,
  resolveRevealDelta,
  resolveToggleCompensation,
  shouldShowJumpToLatest
} from './native-chat-scroll-anchoring'

const atEnd = { scrollTop: 900, scrollHeight: 1500, clientHeight: 600 }
const inBand = {
  scrollTop: 900 - NATIVE_CHAT_FOLLOW_REARM_BAND_PX,
  scrollHeight: 1500,
  clientHeight: 600
}
const justOutsideBand = {
  scrollTop: 900 - NATIVE_CHAT_FOLLOW_REARM_BAND_PX - 1,
  scrollHeight: 1500,
  clientHeight: 600
}
const farAway = { scrollTop: 0, scrollHeight: 1500, clientHeight: 600 }
const underflowing = { scrollTop: 0, scrollHeight: 400, clientHeight: 600 }

describe('distanceFromEnd', () => {
  it('is zero at the exact end and never negative', () => {
    expect(distanceFromEnd(atEnd)).toBe(0)
    expect(distanceFromEnd({ scrollTop: 5000, scrollHeight: 1500, clientHeight: 600 })).toBe(0)
    expect(distanceFromEnd(farAway)).toBe(900)
  })
})

describe('isWithinFollowRearmBand', () => {
  it('uses the strict 40px band', () => {
    expect(NATIVE_CHAT_FOLLOW_REARM_BAND_PX).toBe(40)
    expect(isWithinFollowRearmBand(inBand)).toBe(true)
    expect(isWithinFollowRearmBand(justOutsideBand)).toBe(false)
  })
})

describe('resolveModeAfterScroll', () => {
  it('re-arms follow when the user scrolls back into the band', () => {
    expect(resolveModeAfterScroll('free-scrolling', inBand)).toBe('following-end')
  })
  it('leaves follow when the viewport moves out of the band', () => {
    expect(resolveModeAfterScroll('following-end', justOutsideBand)).toBe('free-scrolling')
  })
  it('keeps anchoring regardless of position (reveal scrolls are programmatic)', () => {
    expect(resolveModeAfterScroll('anchoring-new-turn', atEnd)).toBe('anchoring-new-turn')
    expect(resolveModeAfterScroll('anchoring-new-turn', farAway)).toBe('anchoring-new-turn')
  })
})

describe('resolveModeAfterGesture', () => {
  it('wheel-up breaks follow only when content overflows', () => {
    expect(resolveModeAfterGesture('following-end', 'wheel-up', atEnd)).toBe('free-scrolling')
    expect(resolveModeAfterGesture('following-end', 'wheel-up', underflowing)).toBe('following-end')
  })
  it('scroll keys and scrollbar grabs break follow when content overflows', () => {
    expect(resolveModeAfterGesture('following-end', 'scroll-key', atEnd)).toBe('free-scrolling')
    expect(resolveModeAfterGesture('following-end', 'pointer-scrollbar', atEnd)).toBe(
      'free-scrolling'
    )
  })
  it('content clicks break follow only away from the end band', () => {
    expect(resolveModeAfterGesture('following-end', 'pointer-content', atEnd)).toBe('following-end')
    expect(resolveModeAfterGesture('free-scrolling', 'pointer-content', farAway)).toBe(
      'free-scrolling'
    )
    expect(resolveModeAfterGesture('following-end', 'pointer-content', farAway)).toBe(
      'free-scrolling'
    )
  })
  it('a gesture during anchoring stops the anchored follow', () => {
    expect(resolveModeAfterGesture('anchoring-new-turn', 'wheel-up', atEnd)).toBe('free-scrolling')
  })
})

describe('resolveModeAfterTurnSettled', () => {
  it('hands anchoring off to follow at the live edge', () => {
    expect(resolveModeAfterTurnSettled('anchoring-new-turn', inBand)).toBe('following-end')
  })
  it('leaves an away-from-end reader free', () => {
    expect(resolveModeAfterTurnSettled('anchoring-new-turn', farAway)).toBe('free-scrolling')
  })
  it('does not disturb the other modes', () => {
    expect(resolveModeAfterTurnSettled('following-end', farAway)).toBe('following-end')
    expect(resolveModeAfterTurnSettled('free-scrolling', inBand)).toBe('free-scrolling')
  })
})

describe('shouldShowJumpToLatest', () => {
  it('shows only while free-scrolling away from the end', () => {
    expect(shouldShowJumpToLatest('free-scrolling', farAway)).toBe(true)
    expect(shouldShowJumpToLatest('free-scrolling', inBand)).toBe(false)
    expect(shouldShowJumpToLatest('following-end', farAway)).toBe(false)
    expect(shouldShowJumpToLatest('anchoring-new-turn', farAway)).toBe(false)
  })
  it('hides when there is nothing to scroll', () => {
    expect(shouldShowJumpToLatest('free-scrolling', underflowing)).toBe(false)
  })
})

describe('resolveAnchorSpacerPx', () => {
  it('reserves the space below the anchor up to the viewport minus the offset', () => {
    // 600px viewport, 40px offset, 100px of content below the anchor → 460px.
    expect(
      resolveAnchorSpacerPx({
        viewportHeight: 600,
        anchorTop: 900,
        contentHeightWithoutSpacer: 1000
      })
    ).toBe(460)
  })
  it('shrinks to zero once the turn fills the viewport', () => {
    expect(
      resolveAnchorSpacerPx({
        viewportHeight: 600,
        anchorTop: 100,
        contentHeightWithoutSpacer: 1000
      })
    ).toBe(0)
  })
})

describe('resolveRevealDelta', () => {
  it('scrolls by the minimal delta once the live edge grows past the viewport', () => {
    expect(resolveRevealDelta({ scrollTop: 0, viewportHeight: 600, contentBottom: 650 })).toBe(50)
  })
  it('ignores deltas at or below 1px', () => {
    expect(resolveRevealDelta({ scrollTop: 0, viewportHeight: 600, contentBottom: 601 })).toBe(0)
    expect(resolveRevealDelta({ scrollTop: 0, viewportHeight: 600, contentBottom: 500 })).toBe(0)
  })
})

describe('resolveToggleCompensation', () => {
  it('returns the shift when at or above half a pixel', () => {
    expect(resolveToggleCompensation(100, 130.5)).toBe(30.5)
    expect(resolveToggleCompensation(100, 99)).toBe(-1)
  })
  it('ignores sub-pixel noise', () => {
    expect(resolveToggleCompensation(100, 100.4)).toBe(0)
  })
})

describe('contentOverflows', () => {
  it('is false when content fits the viewport', () => {
    expect(contentOverflows(underflowing)).toBe(false)
    expect(contentOverflows(atEnd)).toBe(true)
  })
})
