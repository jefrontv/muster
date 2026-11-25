import { describe, expect, it } from 'vitest'
import { getDropIndicatorClasses } from './drop-indicator'

describe('getDropIndicatorClasses', () => {
  it('draws a centred pill bar in the gap before the tab', () => {
    const classes = getDropIndicatorClasses('left')
    expect(classes).toContain('before:-left-[3px]')
    expect(classes).toContain('before:h-4')
    expect(classes).toContain('before:w-0.5')
    expect(classes).toContain('before:rounded-full')
    expect(classes).toContain('before:bg-status-info')
    expect(classes).not.toContain('after:')
  })

  it('draws the bar in the gap after the tab', () => {
    const classes = getDropIndicatorClasses('right')
    expect(classes).toContain('after:-right-[3px]')
    expect(classes).toContain('after:-translate-y-1/2')
    expect(classes).not.toContain('before:')
  })

  it('returns an empty string for no indicator', () => {
    expect(getDropIndicatorClasses(null)).toBe('')
  })
})
