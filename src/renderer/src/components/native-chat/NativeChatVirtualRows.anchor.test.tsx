// @vitest-environment happy-dom

// Drives the real NativeChatVirtualRows (and tanstack's virtualizer) with the row
// anchor, under a hand-made layout: happy-dom has none, so rects, offsetHeight,
// scrolling and ResizeObserver are modelled from per-row heights.

import { act, cleanup, render } from '@testing-library/react'
import { useCallback, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatTimelineRow } from './native-chat-timeline-rows'
import { useNativeChatRowAnchor } from './use-native-chat-row-anchor'

vi.mock('./NativeChatTimelineRowView', () => ({
  NativeChatTimelineRowView: ({ row }: { row: NativeChatTimelineRow }) => <div>{row.key}</div>
}))

import { NativeChatVirtualRows } from './NativeChatVirtualRows'

const VIEWPORT = 600
const heights = new Map<string, number>()
let scrollTop = 0
let scroller: HTMLElement | null = null
let content: HTMLElement | null = null

const row = (key: string, height: number): NativeChatTimelineRow => {
  heights.set(key, height)
  return { kind: 'turn-error', key, turnId: key, message: '' } as NativeChatTimelineRow
}
const rowsOf = (prefix: string, count: number, height: number) =>
  Array.from({ length: count }, (_, index) => row(`${prefix}${index}`, height))

const head = () => content?.firstElementChild as HTMLElement | null
const headHeight = () => Number.parseFloat(head()?.style.height ?? '0') || 0
const isItem = (el: Element) => el.hasAttribute('data-index')
const itemHeight = (el: Element) => heights.get(el.getAttribute('data-row-anchor') ?? '') ?? 0
const translateY = (el: HTMLElement) =>
  Number.parseFloat(/translateY\((-?[\d.]+)px\)/.exec(el.style.transform)?.[1] ?? '0')
const rect = (top: number, height: number) =>
  ({ top, bottom: top + height, height, left: 0, right: 0, width: 400, x: 0, y: top }) as DOMRect

function setScroll(value: number): void {
  const next = Math.max(0, Math.min(value, Math.max(0, headHeight() - VIEWPORT)))
  if (next === scrollTop) {
    return
  }
  scrollTop = next
  // Browsers report a scroll on the next frame, not synchronously.
  setTimeout(() => scroller?.dispatchEvent(new Event('scroll')))
}

const originalRect = Element.prototype.getBoundingClientRect
let originalViewObserver: unknown
beforeEach(() => {
  heights.clear()
  scrollTop = 0
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this === scroller) {
      return rect(0, VIEWPORT)
    }
    if (this === content || this === head()) {
      return rect(-scrollTop, headHeight())
    }
    if (isItem(this)) {
      return rect(-scrollTop + translateY(this as HTMLElement), itemHeight(this))
    }
    return rect(0, 0)
  }
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isItem(this) ? itemHeight(this) : this === scroller ? VIEWPORT : 0
    }
  })
  const ModelledResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element): void {
      setTimeout(() =>
        this.callback(
          [
            {
              target,
              borderBoxSize: [{ blockSize: (target as HTMLElement).offsetHeight, inlineSize: 400 }]
            } as unknown as ResizeObserverEntry
          ],
          this as unknown as ResizeObserver
        )
      )
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', ModelledResizeObserver)
  // tanstack reads it from the element's window, which happy-dom keeps apart from globalThis.
  const view = document.defaultView as unknown as { ResizeObserver: unknown }
  originalViewObserver = view.ResizeObserver
  view.ResizeObserver = ModelledResizeObserver
})

afterEach(() => {
  cleanup()
  ;(document.defaultView as unknown as { ResizeObserver: unknown }).ResizeObserver =
    originalViewObserver
  Element.prototype.getBoundingClientRect = originalRect
  vi.unstubAllGlobals()
})

function Harness({ rows }: { rows: NativeChatTimelineRow[] }): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const anchor = useNativeChatRowAnchor({ scrollRef, contentRef, isActive: () => true })
  // Stable refs: an inline callback ref detaches and re-attaches on every render.
  const attachScroller = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el
    scroller = el
    if (el) {
      Object.defineProperty(el, 'scrollTop', {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => setScroll(value)
      })
      el.scrollTo = ((options: ScrollToOptions) =>
        setScroll(options.top ?? 0)) as typeof el.scrollTo
    }
  }, [])
  const attachContent = useCallback((el: HTMLDivElement | null) => {
    contentRef.current = el
    content = el
  }, [])
  return (
    <div ref={attachScroller} onScroll={anchor.capture}>
      <div ref={attachContent}>
        <NativeChatVirtualRows
          rows={rows}
          actions={{ onToggle: () => undefined, allowFileUriLinks: false }}
          scrollRef={scrollRef}
          fontScale={1}
          sourceRef={anchor.sourceRef}
          onLayout={anchor.correct}
        />
      </div>
    </div>
  )
}

/** The scroller's ref attaches after the virtualizer's first layout pass, as in the list; a second render picks it up. */
function mountHarness(rows: NativeChatTimelineRow[]): ReturnType<typeof render> {
  const view = render(<Harness rows={rows} />)
  view.rerender(<Harness rows={rows} />)
  return view
}

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/** The mounted row under the viewport top, and its offset from it. */
function rowAtTop(): { id: string; offset: number } {
  for (const el of content!.querySelectorAll<HTMLElement>('[data-index]')) {
    const box = el.getBoundingClientRect()
    if (box.top <= 0 && box.bottom > 0) {
      return { id: el.getAttribute('data-row-anchor')!, offset: box.top }
    }
  }
  throw new Error(`no row at the viewport top (scrollTop ${scrollTop})`)
}

function offsetOf(id: string): number {
  const el = content!.querySelector<HTMLElement>(`[data-row-anchor="${id}"]`)
  if (!el) {
    throw new Error(`${id} is not mounted`)
  }
  return el.getBoundingClientRect().top
}

describe('NativeChatVirtualRows with the row anchor', () => {
  it('holds the row under the pointer when a page prepends during a wheel tick', async () => {
    const page = rowsOf('r', 60, 100)
    const view = mountHarness(page)
    await settle()
    setScroll(2450)
    await settle()
    const before = rowAtTop()

    // The tick lands, then the older page commits before its scroll event fires.
    setScroll(scrollTop - 400)
    view.rerender(<Harness rows={[...rowsOf('p', 20, 120), ...page]} />)
    await settle()

    expect(offsetOf(before.id)).toBeCloseTo(before.offset + 400, 0)
  })

  it('holds position across prepends that land while the reader is at the top', async () => {
    let rows = rowsOf('r', 60, 100)
    const view = mountHarness(rows)
    await settle()
    setScroll(0)
    await settle()
    const before = rowAtTop()
    for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
      rows = [...rowsOf(`p${pageIndex}-`, 20, 90 + pageIndex * 30), ...rows]
      view.rerender(<Harness rows={rows} />)
      await settle()
      expect(offsetOf(before.id)).toBeCloseTo(before.offset, 0)
    }
    expect(scrollTop).toBeGreaterThan(0)
  })
})
