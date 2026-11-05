import { describe, expect, it } from 'vitest'
import {
  RIGHT_SIDEBAR_ABSOLUTE_FALLBACK_MAX_WIDTH,
  RIGHT_SIDEBAR_MIN_WIDTH,
  clampRightSidebarPanelWidth,
  computeMaxRightSidebarPanelWidth,
  widthBesideLeftSidebar
} from './right-sidebar-width'

describe('right sidebar rendered width', () => {
  it('leaves the reserved non-sidebar area when persisted width is too large', () => {
    expect(clampRightSidebarPanelWidth(900, 900, 0)).toBe(580)
  })

  it('includes rendered extra width in the reservation math', () => {
    expect(computeMaxRightSidebarPanelWidth(900, 40)).toBe(540)
    expect(clampRightSidebarPanelWidth(900, 900, 40)).toBe(540)
  })

  it('preserves the minimum sidebar width on narrow windows', () => {
    expect(clampRightSidebarPanelWidth(900, 400, 40)).toBe(RIGHT_SIDEBAR_MIN_WIDTH)
  })

  it('uses the fallback max outside DOM environments', () => {
    expect(computeMaxRightSidebarPanelWidth(null, 40)).toBe(
      RIGHT_SIDEBAR_ABSOLUTE_FALLBACK_MAX_WIDTH
    )
  })

  it('keeps the centre reserve when the left sidebar is open', () => {
    // 800px window, 325px left sidebar: 155px of room is under the 220px floor, so the floor wins.
    expect(clampRightSidebarPanelWidth(400, widthBesideLeftSidebar(800, 325), 0)).toBe(
      RIGHT_SIDEBAR_MIN_WIDTH
    )
    expect(clampRightSidebarPanelWidth(400, widthBesideLeftSidebar(1200, 325), 0)).toBe(400)
    expect(widthBesideLeftSidebar(null, 325)).toBeNull()
  })
})
