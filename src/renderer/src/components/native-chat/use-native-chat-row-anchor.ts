// DOM wiring for the row anchor: capture on scroll, correct after any layout change
// (renders, measured windowed rows, resizes). Off while following the end, where
// the scroll-anchoring hook pins the bottom instead.

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import {
  captureRowAnchors,
  NATIVE_CHAT_ROW_ANCHOR_ATTR,
  rowAnchorShift,
  type NativeChatRowAnchor,
  type NativeChatRowBox
} from './native-chat-row-anchor'

/** Windowed rows with viewport positions, mounted or not. */
export type NativeChatVirtualRowSource = {
  has: (id: string) => boolean
  boxes: () => NativeChatRowBox[]
}

export function useNativeChatRowAnchor(input: {
  scrollRef: RefObject<HTMLDivElement | null>
  contentRef: RefObject<HTMLDivElement | null>
  isActive: () => boolean
}): {
  capture: () => void
  correct: () => void
  sourceRef: RefObject<NativeChatVirtualRowSource | null>
} {
  const { scrollRef, contentRef, isActive } = input
  const anchorsRef = useRef<NativeChatRowAnchor[]>([])
  const sourceRef = useRef<NativeChatVirtualRowSource | null>(null)

  /** Every row in document order, content-relative: windowed rows from the virtualizer, the rest from the DOM. */
  const readBoxes = useCallback((content: HTMLElement): NativeChatRowBox[] => {
    const origin = content.getBoundingClientRect().top
    const source = sourceRef.current
    const boxes: NativeChatRowBox[] = (source?.boxes() ?? []).map((box) => ({
      id: box.id,
      top: box.top - origin,
      bottom: box.bottom - origin
    }))
    for (const el of content.querySelectorAll<HTMLElement>(`[${NATIVE_CHAT_ROW_ANCHOR_ATTR}]`)) {
      const id = el.getAttribute(NATIVE_CHAT_ROW_ANCHOR_ATTR)
      if (!id || source?.has(id)) {
        continue
      }
      const rect = el.getBoundingClientRect()
      if (rect.height > 0) {
        boxes.push({ id, top: rect.top - origin, bottom: rect.bottom - origin })
      }
    }
    return boxes.sort((a, b) => a.top - b.top)
  }, [])

  const capture = useCallback(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) {
      return
    }
    const viewportTop = scroller.getBoundingClientRect().top - content.getBoundingClientRect().top
    anchorsRef.current = captureRowAnchors(readBoxes(content), viewportTop)
  }, [contentRef, readBoxes, scrollRef])

  const correct = useCallback(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) {
      return
    }
    if (!isActive() || anchorsRef.current.length === 0) {
      capture()
      return
    }
    const tops = new Map(readBoxes(content).map((box) => [box.id, box.top]))
    const shift = rowAnchorShift(anchorsRef.current, (id) => tops.get(id) ?? null)
    if (Math.abs(shift) >= 1) {
      // Live scrollTop: any wheel delta since the capture stays applied.
      scroller.scrollTop += shift
    }
    capture()
  }, [capture, contentRef, isActive, readBoxes, scrollRef])

  useEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => correct())
    observer.observe(content)
    return () => observer.disconnect()
  }, [contentRef, correct])

  return { capture, correct, sourceRef }
}
