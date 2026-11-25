import { describe, expect, it } from 'vitest'
import { computeCloseFreezeSpacer } from './tab-strip-close-freeze'

describe('computeCloseFreezeSpacer', () => {
  it('grows the spacer by the closed width while the pointer is in a scrolled strip', () => {
    expect(
      computeCloseFreezeSpacer({
        pointerInside: true,
        lastScrollLeft: 294,
        removedWidth: 176,
        currentSpacer: 176
      })
    ).toBe(352)
  })

  it('ignores keyboard closes, unscrolled strips and added tabs', () => {
    const base = { lastScrollLeft: 294, removedWidth: 176, currentSpacer: 0 }
    expect(computeCloseFreezeSpacer({ ...base, pointerInside: false })).toBe(0)
    expect(computeCloseFreezeSpacer({ ...base, pointerInside: true, lastScrollLeft: 0 })).toBe(0)
    expect(computeCloseFreezeSpacer({ ...base, pointerInside: true, removedWidth: -176 })).toBe(0)
  })
})
