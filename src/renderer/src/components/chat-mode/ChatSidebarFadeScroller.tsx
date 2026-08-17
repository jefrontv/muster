// Height-capped list scroller with fade edges instead of a scrollbar: the
// gradient into the sidebar background is the "more below/above" affordance.

import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** Scroll must exceed this before an edge counts as "past it" — avoids a fade
 *  flickering in over sub-pixel scroll positions. */
const EDGE_EPSILON_PX = 4

export function ChatSidebarFadeScroller({
  children,
  maxHeightClassName = 'max-h-56'
}: {
  children: React.ReactNode
  /** Tailwind max-height class for the scroll viewport. */
  maxHeightClassName?: string
}): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [pastTop, setPastTop] = useState(false)
  const [pastBottom, setPastBottom] = useState(false)

  const readEdges = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    const maxScroll = viewport.scrollHeight - viewport.clientHeight
    setPastTop(viewport.scrollTop > EDGE_EPSILON_PX)
    setPastBottom(maxScroll - viewport.scrollTop > EDGE_EPSILON_PX)
  }, [])

  // Rows appear and disappear (new chats, search filtering), so edge state
  // tracks content size as well as scroll position.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    readEdges()
    const observer = new ResizeObserver(readEdges)
    observer.observe(viewport)
    for (const child of viewport.children) {
      observer.observe(child)
    }
    return () => observer.disconnect()
  }, [readEdges, children])

  return (
    <div className="relative">
      <div
        ref={viewportRef}
        onScroll={readEdges}
        className={cn('overflow-y-auto overscroll-contain scrollbar-none', maxHeightClassName)}
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-sidebar to-transparent transition-opacity duration-200 motion-reduce:transition-none',
          pastTop ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-sidebar to-transparent transition-opacity duration-200 motion-reduce:transition-none',
          pastBottom ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  )
}
