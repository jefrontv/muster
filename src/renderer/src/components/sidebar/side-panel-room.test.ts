import { describe, expect, it } from 'vitest'
import { LEFT_SIDEBAR_MIN_WIDTH, fitLeftSidebarWidth } from './side-panel-room'

describe('fitLeftSidebarWidth', () => {
  it('keeps the chosen width when the window has room', () => {
    expect(fitLeftSidebarWidth(325, 1560, 260)).toBe(325)
  })

  it('gives up width before the centre pane drops below its reserve', () => {
    // 860 - 260 right - 320 centre = 280.
    expect(fitLeftSidebarWidth(325, 860, 260)).toBe(280)
  })

  it('stops at its floor on very narrow windows', () => {
    expect(fitLeftSidebarWidth(325, 730, 260)).toBe(LEFT_SIDEBAR_MIN_WIDTH)
  })

  it('leaves the width alone outside the DOM', () => {
    expect(fitLeftSidebarWidth(325, null, 260)).toBe(325)
  })
})
