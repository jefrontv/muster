import { describe, expect, it } from 'vitest'
import { TAB_COLOR_SWATCHES, getTabColorStyle, resolveTabColor } from './tab-colors'

describe('tab colours', () => {
  it('keeps every stored hex id and puts none first', () => {
    expect(TAB_COLOR_SWATCHES.map((s) => s.value)).toEqual([
      null,
      '#3b82f6',
      '#a855f7',
      '#ec4899',
      '#ef4444',
      '#f97316',
      '#eab308',
      '#22c55e',
      '#14b8a6',
      '#9ca3af'
    ])
  })

  it('renders known ids through the theme token and unknown values as stored', () => {
    expect(resolveTabColor('#3B82F6')).toBe('var(--tab-color-blue)')
    expect(resolveTabColor('#123456')).toBe('#123456')
    expect(resolveTabColor(null)).toBeNull()
  })

  it('outlines and tints the whole tab without touching box-shadow', () => {
    const style = getTabColorStyle('#22c55e')
    expect(style?.outline).toBe('1px solid var(--tab-color-green)')
    expect(style?.outlineOffset).toBe('-1px')
    expect(style?.backgroundImage).toContain('color-mix(in oklab, var(--tab-color-green) 12%')
    expect(style).not.toHaveProperty('boxShadow')
    expect(getTabColorStyle(null)).toBeUndefined()
  })
})
