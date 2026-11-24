import { describe, expect, it } from 'vitest'
import { luminance, readableLabelColor } from './project-pages-diagram-label-contrast'

describe('label contrast', () => {
  it('flips white text on pastel fills and keeps text that already reads', () => {
    expect(readableLabelColor('#dae8fc', '#f5f5f5')).toBe('#1f1f1f')
    expect(readableLabelColor('#333333', '#1f1f1f')).toBe('#f5f5f5')
    expect(readableLabelColor('#dae8fc', '#1f1f1f')).toBe('#1f1f1f')
    expect(readableLabelColor('#ffffff', '#ff0000')).toBe('#ff0000')
    expect(readableLabelColor('rgb(1,2,3)', '#fff')).toBe('#fff')
    expect(luminance('#fff')).toBe(1)
  })
})
