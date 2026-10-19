// Which edges of a capped group body still have rows beyond them, so the
// 24px fade only shows where scrolling would reveal more.

import { useCallback, useLayoutEffect, useRef, useState, type RefCallback } from 'react'

export type ScrollFades = { top: boolean; bottom: boolean }

const NONE: ScrollFades = { top: false, bottom: false }

export function scrollFadesOf(element: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}): ScrollFades {
  const { scrollTop, scrollHeight, clientHeight } = element
  // One pixel of slack: fractional zoom leaves scrollTop a hair short of the end.
  return { top: scrollTop > 1, bottom: scrollHeight - clientHeight - scrollTop > 1 }
}

export function useScrollFades(): {
  scrollRef: RefCallback<HTMLElement>
  contentRef: RefCallback<HTMLElement>
  fades: ScrollFades
  onScroll: () => void
} {
  const scroller = useRef<HTMLElement | null>(null)
  const [fades, setFades] = useState<ScrollFades>(NONE)
  const measure = useCallback((): void => {
    const node = scroller.current
    const next = node ? scrollFadesOf(node) : NONE
    setFades((prev) => (prev.top === next.top && prev.bottom === next.bottom ? prev : next))
  }, [])
  const scrollRef = useCallback((node: HTMLElement | null) => {
    scroller.current = node
  }, [])
  const observer = useRef<ResizeObserver | null>(null)
  // A row opening inside the body grows the content, not the capped scroller.
  const contentRef = useCallback(
    (node: HTMLElement | null) => {
      observer.current?.disconnect()
      observer.current = null
      if (node && typeof ResizeObserver !== 'undefined') {
        observer.current = new ResizeObserver(measure)
        observer.current.observe(node)
      }
    },
    [measure]
  )
  useLayoutEffect(measure)
  return { scrollRef, contentRef, fades, onScroll: measure }
}
