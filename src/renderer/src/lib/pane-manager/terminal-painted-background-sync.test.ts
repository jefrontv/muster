import { describe, expect, it } from 'vitest'
import type { IBufferCell, ITheme } from '@xterm/xterm'
import {
  readBackgroundAlpha,
  parseOscColor,
  readCellBackground,
  readPaintedEdgeBackground,
  unpremultiplyBackground
} from './terminal-painted-background-sync'

type CellSpec =
  | { kind: 'default' }
  | { kind: 'rgb'; value: number }
  | { kind: 'palette'; value: number }

function cell(spec: CellSpec): IBufferCell {
  return {
    isBgDefault: () => spec.kind === 'default',
    isBgRGB: () => spec.kind === 'rgb',
    isBgPalette: () => spec.kind === 'palette',
    getBgColor: () => (spec.kind === 'default' ? 0 : spec.value)
  } as unknown as IBufferCell
}

function terminalWith(
  rows: CellSpec[],
  theme?: ITheme
): Parameters<typeof readPaintedEdgeBackground>[0] {
  return {
    cols: 4,
    rows: rows.length,
    options: { theme },
    buffer: {
      active: {
        viewportY: 0,
        getLine: (y: number) => (rows[y] ? { getCell: () => cell(rows[y]) } : undefined)
      }
    }
  } as unknown as Parameters<typeof readPaintedEdgeBackground>[0]
}

describe('readCellBackground', () => {
  it('reads a true-colour background', () => {
    expect(readCellBackground(cell({ kind: 'rgb', value: 0x030304 }), undefined)).toBe('#030304')
  })

  it('reads palette colours from the theme, the 6x6x6 cube and the grey ramp', () => {
    expect(readCellBackground(cell({ kind: 'palette', value: 4 }), { blue: '#0000ee' })).toBe(
      '#0000ee'
    )
    expect(readCellBackground(cell({ kind: 'palette', value: 16 }), undefined)).toBe('#000000')
    expect(readCellBackground(cell({ kind: 'palette', value: 231 }), undefined)).toBe('#ffffff')
    expect(readCellBackground(cell({ kind: 'palette', value: 232 }), undefined)).toBe('#080808')
  })

  it('treats an unthemed ansi index and a default background as unknown', () => {
    expect(readCellBackground(cell({ kind: 'palette', value: 4 }), {})).toBeNull()
    expect(readCellBackground(cell({ kind: 'default' }), undefined)).toBeNull()
  })
})

describe('readBackgroundAlpha', () => {
  it('keeps the composed theme opacity and defaults opaque', () => {
    expect(readBackgroundAlpha('rgba(30, 30, 30, 0.8)')).toBe(0.8)
    expect(readBackgroundAlpha('#1e1e1e')).toBe(1)
    expect(readBackgroundAlpha(undefined)).toBe(1)
  })
})

describe('readPaintedEdgeBackground', () => {
  it('reports the colour a uniformly painted screen puts beside the leftover strip', () => {
    const painted: CellSpec = { kind: 'rgb', value: 0x030304 }
    expect(readPaintedEdgeBackground(terminalWith([painted, painted, painted]))).toBe('#030304')
  })

  it('reports nothing when the edge is only partly painted', () => {
    // Why: a coloured status line must not repaint the whole pane host.
    expect(
      readPaintedEdgeBackground(
        terminalWith([{ kind: 'default' }, { kind: 'default' }, { kind: 'rgb', value: 0x2277cc }])
      )
    ).toBeNull()
  })

  it('reports nothing for a plain shell, leaving the theme background in place', () => {
    const blank: CellSpec = { kind: 'default' }
    expect(readPaintedEdgeBackground(terminalWith([blank, blank, blank]))).toBeNull()
  })
})

describe('parseOscColor', () => {
  it('reads the colour forms OSC 11 answers with', () => {
    expect(parseOscColor('#232323')).toBe('#232323')
    expect(parseOscColor('#fff')).toBe('#ffffff')
    expect(parseOscColor('rgb:2323/2323/2323')).toBe('#232323')
    expect(parseOscColor('rgb:ff/00/80')).toBe('#ff0080')
  })

  it('rejects queries and names it cannot resolve', () => {
    // Why: a `?` query must not clear the background a TUI already set.
    expect(parseOscColor('?')).toBeNull()
    expect(parseOscColor('rebeccapurple')).toBeNull()
    expect(parseOscColor('rgb:zz/00/00')).toBeNull()
  })
})

describe('unpremultiplyBackground', () => {
  it('divides a translucent background by its alpha', () => {
    expect(unpremultiplyBackground('rgba(30, 30, 30, 0.8)')).toBe('rgba(38, 38, 38, 0.8)')
  })

  it('clamps at white and leaves opaque colours alone', () => {
    expect(unpremultiplyBackground('rgba(220, 220, 220, 0.5)')).toBe('rgba(255, 255, 255, 0.5)')
    expect(unpremultiplyBackground('rgba(30, 30, 30, 1)')).toBe('rgba(30, 30, 30, 1)')
    expect(unpremultiplyBackground('#1e1e1e')).toBe('#1e1e1e')
  })
})
