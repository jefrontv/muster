import { describe, expect, it } from 'vitest'

import {
  activeCollabDueStatus,
  activeCollabLabelChipStyle,
  activeCollabSubtaskProgress
} from './task-page-activecollab-row-presentation'

/** WCAG 2.x contrast ratio, written out here so the chip's promise is measured, not assumed. */
function contrastRatio(first: string, second: string): number {
  const luminance = (hex: string): number => {
    const value = Number.parseInt(hex.slice(1), 16)
    const toLinear = (channel: number): number => {
      const normalized = channel / 255
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
    }
    return (
      0.2126 * toLinear((value >> 16) & 0xff) +
      0.7152 * toLinear((value >> 8) & 0xff) +
      0.0722 * toLinear(value & 0xff)
    )
  }
  const [a, b] = [luminance(first), luminance(second)]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('activeCollabDueStatus', () => {
  const TODAY_NOON = new Date(2026, 6, 27, 12, 30).getTime()

  it('calls a task due before today overdue', () => {
    expect(activeCollabDueStatus(new Date(2026, 6, 26).getTime(), TODAY_NOON)).toBe('overdue')
    expect(activeCollabDueStatus(new Date(2025, 11, 31).getTime(), TODAY_NOON)).toBe('overdue')
  })

  it('calls a task due on the current calendar day today', () => {
    expect(activeCollabDueStatus(new Date(2026, 6, 27).getTime(), TODAY_NOON)).toBe('today')
  })

  it('still says today at one minute to midnight, because it compares days not elapsed time', () => {
    const almostMidnight = new Date(2026, 6, 27, 23, 59).getTime()
    expect(activeCollabDueStatus(new Date(2026, 6, 27).getTime(), almostMidnight)).toBe('today')
  })

  it('calls a task due later upcoming, across month and year boundaries', () => {
    expect(activeCollabDueStatus(new Date(2026, 6, 28).getTime(), TODAY_NOON)).toBe('upcoming')
    expect(activeCollabDueStatus(new Date(2026, 7, 1).getTime(), TODAY_NOON)).toBe('upcoming')
    expect(activeCollabDueStatus(new Date(2027, 0, 1).getTime(), TODAY_NOON)).toBe('upcoming')
  })
})

describe('activeCollabLabelChipStyle', () => {
  it('falls back to the neutral chip when the instance supplied no colour', () => {
    expect(activeCollabLabelChipStyle(null)).toBeNull()
    expect(activeCollabLabelChipStyle('')).toBeNull()
  })

  it('falls back to the neutral chip for anything that is not a hex colour', () => {
    expect(activeCollabLabelChipStyle('red')).toBeNull()
    expect(activeCollabLabelChipStyle('rgb(255, 0, 0)')).toBeNull()
    expect(activeCollabLabelChipStyle('#ff66')).toBeNull()
    expect(activeCollabLabelChipStyle('#gggggg')).toBeNull()
  })

  it('paints the instance colour as the chip fill rather than as the text', () => {
    expect(activeCollabLabelChipStyle('#ff6600')).toEqual({
      backgroundColor: '#ff6600',
      borderColor: '#ff6600',
      color: '#000000'
    })
  })

  it('flips to white text on a dark fill', () => {
    expect(activeCollabLabelChipStyle('#1a1b26')?.color).toBe('#ffffff')
    expect(activeCollabLabelChipStyle('#000000')?.color).toBe('#ffffff')
  })

  it('keeps black text on a light fill', () => {
    expect(activeCollabLabelChipStyle('#ffffff')?.color).toBe('#000000')
    expect(activeCollabLabelChipStyle('#ffff00')?.color).toBe('#000000')
  })

  it('stays white on a saturated mid-tone where white still clears the floor', () => {
    // #1a73e8 sits in the sliver where black measures marginally higher (4.66 vs 4.51). White wins
    // anyway, because a coloured chip with black text reads as a rendering fault.
    const style = activeCollabLabelChipStyle('#1a73e8')
    expect(style?.color).toBe('#ffffff')
    expect(contrastRatio('#ffffff', '#1a73e8')).toBeGreaterThanOrEqual(4.5)
  })

  it('reads three-digit shorthand as the colour it abbreviates', () => {
    expect(activeCollabLabelChipStyle('#f60')?.color).toBe(
      activeCollabLabelChipStyle('#ff6600')?.color
    )
    // The fill keeps the instance's own spelling; CSS expands the shorthand itself.
    expect(activeCollabLabelChipStyle('  #f60  ')?.backgroundColor).toBe('#f60')
  })

  it('clears 4.5:1 for every colour an instance could hand out', () => {
    const steps = [0x00, 0x3b, 0x76, 0xb1, 0xec, 0xff]
    let worst = Number.POSITIVE_INFINITY
    for (const red of steps) {
      for (const green of steps) {
        for (const blue of steps) {
          const hex = `#${[red, green, blue].map((c) => c.toString(16).padStart(2, '0')).join('')}`
          const style = activeCollabLabelChipStyle(hex)
          if (!style) {
            throw new Error(`hex ${hex} should have produced a chip style`)
          }
          worst = Math.min(worst, contrastRatio(style.color, style.backgroundColor))
        }
      }
    }
    expect(worst).toBeGreaterThanOrEqual(4.5)
  })
})

describe('activeCollabSubtaskProgress', () => {
  it('reads done over total', () => {
    expect(activeCollabSubtaskProgress(1, 3)).toBe('2/3')
    expect(activeCollabSubtaskProgress(0, 3)).toBe('3/3')
    expect(activeCollabSubtaskProgress(3, 3)).toBe('0/3')
  })

  it('says nothing when the task has no subtasks to report on', () => {
    expect(activeCollabSubtaskProgress(null, null)).toBeNull()
    expect(activeCollabSubtaskProgress(0, 0)).toBeNull()
    expect(activeCollabSubtaskProgress(2, null)).toBeNull()
  })

  it('never claims progress it cannot see, and never claims more than the total', () => {
    // An absent open count is the instance omitting the field, not the task being finished.
    expect(activeCollabSubtaskProgress(null, 4)).toBe('0/4')
    // Counts that disagree cannot print a negative or an over-count.
    expect(activeCollabSubtaskProgress(9, 4)).toBe('0/4')
    expect(activeCollabSubtaskProgress(-2, 4)).toBe('4/4')
  })
})
