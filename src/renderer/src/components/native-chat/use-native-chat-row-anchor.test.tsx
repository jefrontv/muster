// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react'
import { useRef, type RefObject } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { NATIVE_CHAT_ROW_ANCHOR_ATTR } from './native-chat-row-anchor'
import {
  useNativeChatRowAnchor,
  type NativeChatVirtualRowSource
} from './use-native-chat-row-anchor'

// A scroller at viewport y=0 holding rows stacked by height; layout is modelled
// by hand since happy-dom has none.
type Row = { id: string; height: number }

function rowsOf(prefix: string, count: number, height: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index}`, height }))
}

function Harness({
  rows,
  active,
  api
}: {
  rows: Row[]
  active: boolean
  api: { current: ReturnType<typeof useNativeChatRowAnchor> | null }
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  api.current = useNativeChatRowAnchor({ scrollRef, contentRef, isActive: () => active })
  return (
    <div ref={scrollRef} data-testid="scroller">
      <div ref={contentRef} data-testid="content">
        {rows.map((row) => (
          <div key={row.id} {...{ [NATIVE_CHAT_ROW_ANCHOR_ATTR]: row.id }} />
        ))}
      </div>
    </div>
  )
}

function mount(initial: Row[], active = true) {
  let rows = initial
  let scrollTop = 0
  const api: { current: ReturnType<typeof useNativeChatRowAnchor> | null } = { current: null }
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top }) as DOMRect
  const layout = () => {
    const scroller = view.getByTestId('scroller')
    const content = view.getByTestId('content')
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.max(0, value)
      }
    })
    scroller.getBoundingClientRect = () => rect(0, 600)
    content.getBoundingClientRect = () => rect(-scrollTop, 0)
    let top = 0
    for (const row of rows) {
      const el = content.querySelector<HTMLElement>(`[${NATIVE_CHAT_ROW_ANCHOR_ATTR}="${row.id}"]`)
      const rowTop = top
      if (el) {
        el.getBoundingClientRect = () => rect(rowTop - scrollTop, row.height)
      }
      top += row.height
    }
  }
  const view = render(<Harness rows={rows} active={active} api={api} />)
  layout()
  return {
    api: () => api.current!,
    get scrollTop() {
      return scrollTop
    },
    scrollTo(value: number) {
      scrollTop = value
    },
    setRows(next: Row[]) {
      rows = next
      view.rerender(<Harness rows={next} active={active} api={api} />)
      layout()
    }
  }
}

afterEach(() => cleanup())

describe('useNativeChatRowAnchor', () => {
  it('keeps a wheel tick that lands between the capture and the prepend', () => {
    const list = mount(rowsOf('r', 10, 100))
    list.scrollTo(450)
    act(() => list.api().capture())
    // The tick moves -400 before any scroll event re-captures.
    list.scrollTo(50)
    list.setRows([...rowsOf('p', 20, 120), ...rowsOf('r', 10, 100)])
    act(() => list.api().correct())
    // 2400px prepended: content under the pointer stays, and the tick still counts.
    expect(list.scrollTop).toBe(50 + 2400)
  })

  it('corrects rows above the viewport re-measured after a prepend', () => {
    const page = rowsOf('p', 20, 120)
    const list = mount([...page, ...rowsOf('r', 10, 100)])
    list.scrollTo(2450)
    act(() => list.api().capture())
    // Estimates were 120; measured, the page is 940px shorter in total.
    const measured = page.map((row, index) => ({ ...row, height: index < 10 ? 26 : 120 }))
    list.setRows([...measured, ...rowsOf('r', 10, 100)])
    act(() => list.api().correct())
    expect(list.scrollTop).toBe(2450 - 940)
  })

  it('falls back to the next visible row when the first one is rekeyed', () => {
    const list = mount(rowsOf('r', 10, 100))
    list.scrollTo(450)
    act(() => list.api().capture())
    const next = rowsOf('r', 10, 100).map((row) => (row.id === 'r4' ? { ...row, id: 'x4' } : row))
    list.setRows([...rowsOf('p', 5, 100), ...next])
    act(() => list.api().correct())
    expect(list.scrollTop).toBe(950)
  })

  it('anchors on windowed rows that are not mounted, not on rows below them', () => {
    // Only the tail (t*) is in the DOM; the windowed head (w*) lives in the virtualizer.
    const head = rowsOf('w', 30, 100)
    const list = mount(rowsOf('t', 5, 100).map((row) => ({ ...row })))
    let headTop = 0
    let headRows = head
    const source: NativeChatVirtualRowSource = {
      has: (id) => id.startsWith('w'),
      boxes: () => {
        let top = headTop - list.scrollTop
        return headRows.map((row) => {
          const box = { id: row.id, top, bottom: top + row.height }
          top += row.height
          return box
        })
      }
    }
    ;(list.api().sourceRef as RefObject<NativeChatVirtualRowSource | null>).current = source
    list.scrollTo(1450)
    act(() => list.api().capture())
    list.scrollTo(1050)
    // A 2000px page lands above the windowed rows.
    headRows = [...rowsOf('n', 20, 100), ...head]
    headTop = 0
    act(() => list.api().correct())
    expect(list.scrollTop).toBe(1050 + 2000)
  })

  it('leaves scrolling alone while following the end', () => {
    const list = mount(rowsOf('r', 10, 100), false)
    list.scrollTo(450)
    act(() => list.api().capture())
    list.setRows([...rowsOf('p', 20, 120), ...rowsOf('r', 10, 100)])
    act(() => list.api().correct())
    expect(list.scrollTop).toBe(450)
  })
})
