import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeTabSlides, getTabSlideStyle } from './tab-strip-slide'

const ids = ['a', 'b', 'c', 'd', 'e']
const at = (visibleTabId: string, side: 'left' | 'right') => ({ groupId: 'g', visibleTabId, side })
const slots = (slides: Map<string, { slots: number }>) => ids.map((id) => slides.get(id)?.slots)

describe('computeTabSlides', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns nothing when the dragged tab lives in another strip', () => {
    expect(computeTabSlides(ids, 'x', at('b', 'left')).size).toBe(0)
    expect(computeTabSlides(ids, null, null).size).toBe(0)
  })

  it('keeps every tab in place until the pointer passes a neighbour midpoint', () => {
    expect(slots(computeTabSlides(ids, 'b', null))).toEqual([0, 0, 0, 0, 0])
    expect(slots(computeTabSlides(ids, 'b', at('c', 'left')))).toEqual([0, 0, 0, 0, 0])
    expect(slots(computeTabSlides(ids, 'b', at('a', 'right')))).toEqual([0, 0, 0, 0, 0])
  })

  it('slides the passed tabs toward the gap and moves the source slot with the pointer', () => {
    expect(slots(computeTabSlides(ids, 'b', at('d', 'right')))).toEqual([0, 2, -1, -1, 0])
    expect(slots(computeTabSlides(ids, 'd', at('a', 'left')))).toEqual([1, 1, 1, -3, 0])
    expect(slots(computeTabSlides(ids, 'a', at('e', 'right')))).toEqual([4, -1, -1, -1, -1])
  })

  it('marks only the source tab, which renders as an empty slot', () => {
    const slides = computeTabSlides(ids, 'c', at('e', 'left'))
    expect([...slides].filter(([, s]) => s.isSource).map(([id]) => id)).toEqual(['c'])
    expect(getTabSlideStyle(slides.get('c'))?.opacity).toBe(0)
    expect(getTabSlideStyle(slides.get('d'))?.transform).toBe(
      'translateX(calc(-1 * (100% + 0.25rem)))'
    )
    expect(getTabSlideStyle(slides.get('a'))?.transform).toBeUndefined()
    expect(getTabSlideStyle(undefined)).toBeUndefined()
  })

  it('animates the slide unless the user prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(getTabSlideStyle({ slots: 1, isSource: false })?.transition).toContain('transform 150ms')
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(getTabSlideStyle({ slots: 1, isSource: false })?.transition).toBeUndefined()
  })
})
