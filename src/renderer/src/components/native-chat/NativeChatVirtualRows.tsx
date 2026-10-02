// Virtualized older rows of a long transcript. The newest rows stay in normal flow
// (the list's tail), where streaming, send anchoring and the end spacer work on real
// DOM; only history above them is windowed. Zoom is applied per row so measured
// heights and scroll offsets share the scroll container's pixels.

import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { NativeChatTimelineRow } from './native-chat-timeline-rows'
import { NATIVE_CHAT_ROW_ANCHOR_ATTR, nativeChatRowAnchorId } from './native-chat-row-anchor'
import type { NativeChatVirtualRowSource } from './use-native-chat-row-anchor'
import {
  NativeChatTimelineRowView,
  type NativeChatTimelineRowActions
} from './NativeChatTimelineRowView'

/** Rows kept out of the virtualizer at the end of the transcript. */
export const NATIVE_CHAT_LIVE_TAIL_ROWS = 40
/** Below this many rows nothing is virtualized: a plain list is cheaper. */
export const NATIVE_CHAT_VIRTUALIZE_MIN_ROWS = 80
const ESTIMATED_ROW_PX = 140
const OVERSCAN_ROWS = 6
/** The list's row gap (gap-5), drawn as each windowed row's bottom padding. */
const ROW_GAP_PX = 20

/** Where the windowed head ends and the always-rendered tail begins. */
export function nativeChatVirtualSplit(rowCount: number): number {
  return rowCount >= NATIVE_CHAT_VIRTUALIZE_MIN_ROWS ? rowCount - NATIVE_CHAT_LIVE_TAIL_ROWS : 0
}

export function NativeChatVirtualRows({
  rows,
  actions,
  scrollRef,
  fontScale,
  sourceRef,
  onLayout
}: {
  rows: readonly NativeChatTimelineRow[]
  actions: NativeChatTimelineRowActions
  scrollRef: RefObject<HTMLDivElement | null>
  fontScale: number
  /** Filled with every windowed row's position, mounted or not, for the row anchor. */
  sourceRef: RefObject<NativeChatVirtualRowSource | null>
  /** After every render that may have moved rows (measurements land as re-renders). */
  onLayout: () => void
}): React.JSX.Element | null {
  const headRef = useRef<HTMLDivElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  // The head's offset inside the scroller moves with the loading row and zoom.
  useLayoutEffect(() => {
    const head = headRef.current
    const scroller = scrollRef.current
    if (head && scroller) {
      const offset =
        head.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      setScrollMargin((current) => (Math.abs(current - offset) > 0.5 ? offset : current))
    }
  }, [rows.length, fontScale, scrollRef])
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_PX * fontScale,
    overscan: OVERSCAN_ROWS,
    scrollMargin,
    getItemKey: (index) => rows[index]?.key ?? index
  })
  // The row anchor owns corrections: tanstack's own reads a scroll offset cached
  // at the last scroll event, so it undid wheel ticks and missed rows measured
  // right after a programmatic scroll.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false
  useLayoutEffect(() => {
    // Positions come from the virtualizer, which is what places the mounted rows
    // too, so rows outside the window can be anchored and the anchor never falls
    // through to rows below an unrendered stretch.
    const ids = rows.map(nativeChatRowAnchorId)
    const known = new Set(ids)
    const items = virtualizer.measurementsCache
    sourceRef.current = {
      has: (id) => known.has(id),
      boxes: () => {
        const head = headRef.current
        if (!head) {
          return []
        }
        const origin = head.getBoundingClientRect().top - scrollMargin
        return ids.flatMap((id, index) => {
          const item = items[index]
          return item ? [{ id, top: origin + item.start, bottom: origin + item.end }] : []
        })
      }
    }
    onLayout()
  })
  if (rows.length === 0) {
    return null
  }
  return (
    <div ref={headRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((item) => {
        const row = rows[item.index]
        if (!row) {
          return null
        }
        return (
          <div
            key={item.key}
            ref={virtualizer.measureElement}
            data-index={item.index}
            {...{ [NATIVE_CHAT_ROW_ANCHOR_ATTR]: nativeChatRowAnchorId(row) }}
            className="absolute inset-x-0 top-0"
            style={{
              transform: `translateY(${item.start - scrollMargin}px)`,
              paddingBottom: ROW_GAP_PX * fontScale
            }}
          >
            <div style={{ zoom: fontScale }}>
              <NativeChatTimelineRowView row={row} actions={actions} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
