import { describe, expect, it } from 'vitest'
import { getVisibleFraction, shouldScrollActiveTabIntoView } from './tab-strip-scroll-policy'

const strip = { left: 100, width: 500 }

describe('getVisibleFraction', () => {
  it('measures how much of a tab sits inside the strip', () => {
    expect(getVisibleFraction({ left: 200, width: 176 }, strip)).toBe(1)
    expect(getVisibleFraction({ left: 12, width: 176 }, strip)).toBe(0.5)
    expect(getVisibleFraction({ left: 700, width: 176 }, strip)).toBe(0)
  })
})

describe('shouldScrollActiveTabIntoView', () => {
  it('never scrolls a fully visible tab', () => {
    expect(shouldScrollActiveTabIntoView({ source: 'other', visibleFraction: 1 })).toBe(false)
    expect(shouldScrollActiveTabIntoView({ source: 'pointer', visibleFraction: 1 })).toBe(false)
  })

  it('leaves a clicked tab in place while at least half of it shows', () => {
    expect(shouldScrollActiveTabIntoView({ source: 'pointer', visibleFraction: 0.6 })).toBe(false)
    expect(shouldScrollActiveTabIntoView({ source: 'pointer', visibleFraction: 0.3 })).toBe(true)
  })

  it('scrolls keyboard, menu and programmatic activations into view', () => {
    expect(shouldScrollActiveTabIntoView({ source: 'other', visibleFraction: 0.9 })).toBe(true)
  })
})
