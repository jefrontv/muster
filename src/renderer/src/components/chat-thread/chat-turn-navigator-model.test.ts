import { describe, expect, it } from 'vitest'
import { activeTurnIndex, railScrollFor, tickWindow } from './chat-turn-navigator-model'
import { anchoredScrollTop } from './use-chat-turn-paging'

describe('activeTurnIndex', () => {
  it('picks the last turn above the reading line', () => {
    const tops = [0, 400, 900, 1500]
    expect(activeTurnIndex(tops, 0, 600)).toBe(0)
    expect(activeTurnIndex(tops, 300, 600)).toBe(1)
    expect(activeTurnIndex(tops, 1400, 600)).toBe(3)
  })

  it('picks the last turn at the end even when it sits below the line', () => {
    expect(activeTurnIndex([0, 400, 900, 1500], 1000, 600)).toBe(2)
    expect(activeTurnIndex([0, 400, 900, 1500], 1000, 600, true)).toBe(3)
  })
})

describe('tickWindow', () => {
  it('renders the visible ticks with overscan, clamped to the list', () => {
    expect(tickWindow(0, 100, 500)).toEqual({ start: 0, end: 16 })
    expect(tickWindow(1000, 100, 500)).toEqual({ start: 94, end: 116 })
    expect(tickWindow(4950, 100, 500)).toEqual({ start: 489, end: 500 })
  })
})

describe('railScrollFor', () => {
  it('scrolls the rail only when the tick is out of view', () => {
    expect(railScrollFor(5, 100, 200)).toBe(50)
    expect(railScrollFor(15, 100, 200)).toBeNull()
    expect(railScrollFor(40, 100, 200)).toBe(210)
  })
})

describe('anchoredScrollTop', () => {
  it('keeps the same content under the reader after a page is added above', () => {
    expect(anchoredScrollTop({ scrollHeight: 3000, scrollTop: 200 }, 5000)).toBe(2200)
  })
})
