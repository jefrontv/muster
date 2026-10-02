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

/** Viewport top of a windowed row that is not mounted; null when it is not in the window. */
export type NativeChatVirtualRowLocator = (id: string) => number | null

export function useNativeChatRowAnchor(input: {
  scrollRef: RefObject<HTMLDivElement | null>
  contentRef: RefObject<HTMLDivElement | null>
  isActive: () => boolean
}): {
  capture: () => void
  correct: () => void
  locatorRef: RefObject<NativeChatVirtualRowLocator | null>
} {
  const { scrollRef, contentRef, isActive } = input
  const anchorsRef = useRef<NativeChatRowAnchor[]>([])
  const locatorRef = useRef<NativeChatVirtualRowLocator | null>(null)

  const capture = useCallback(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) {
      return
    }
    const origin = content.getBoundingClientRect().top
    const boxes: NativeChatRowBox[] = []
    for (const el of content.querySelectorAll<HTMLElement>(`[${NATIVE_CHAT_ROW_ANCHOR_ATTR}]`)) {
      const rect = el.getBoundingClientRect()
      const id = el.getAttribute(NATIVE_CHAT_ROW_ANCHOR_ATTR)
      if (id && rect.height > 0) {
        boxes.push({ id, top: rect.top - origin, bottom: rect.bottom - origin })
      }
    }
    anchorsRef.current = captureRowAnchors(boxes, scroller.getBoundingClientRect().top - origin)
  }, [contentRef, scrollRef])

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
    const origin = content.getBoundingClientRect().top
    const shift = rowAnchorShift(anchorsRef.current, (id) => {
      const el = content.querySelector<HTMLElement>(
        `[${NATIVE_CHAT_ROW_ANCHOR_ATTR}="${CSS.escape(id)}"]`
      )
      const viewportTop = el ? el.getBoundingClientRect().top : (locatorRef.current?.(id) ?? null)
      return viewportTop === null ? null : viewportTop - origin
    })
    if (Math.abs(shift) >= 1) {
      // Live scrollTop: any wheel delta since the capture stays applied.
      scroller.scrollTop += shift
    }
    capture()
  }, [capture, contentRef, isActive, scrollRef])

  useEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => correct())
    observer.observe(content)
    return () => observer.disconnect()
  }, [contentRef, correct])

  return { capture, correct, locatorRef }
}
