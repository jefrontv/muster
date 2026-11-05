import { describe, expect, it } from 'vitest'
import { findTextSizeViolations } from './check-text-size-floor.mjs'

describe('text size floor', () => {
  it('flags sizes under 11px and half pixels, not the scale or text-2xs', () => {
    const source = [
      `cn('text-[10px] text-[11px]', 'hover:text-[12.5px]')`,
      `'text-2xs text-[13px] text-[9px]'`
    ].join('\n')
    expect(findTextSizeViolations(source)).toEqual([
      { line: 1, text: 'text-[10px]' },
      { line: 1, text: 'text-[12.5px]' },
      { line: 2, text: 'text-[9px]' }
    ])
  })
})
