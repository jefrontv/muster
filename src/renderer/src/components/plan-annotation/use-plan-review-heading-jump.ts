// Contents-panel navigation for the plan review: a smooth scroll that lands the heading near the
// top, then a brief glow so the eye finds where it arrived.
//
// The glow is an overlay in the scroll content, not a class on the heading: ProseMirror owns the
// heading's DOM, and an attribute change there would be read back as an edit to the plan.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { MarkdownTocItem } from '../editor/markdown-table-of-contents'
import { findRichMarkdownTocHeadingTarget } from '../editor/rich-markdown-toc-heading-target'

const LANDING_OFFSET_PX = 24
const GLOW_PADDING_PX = 6
const GLOW_MS = 1200

export type PlanReviewHeadingGlow = {
  key: number
  top: number
  left: number
  width: number
  height: number
}

function flatten(items: readonly MarkdownTocItem[]): MarkdownTocItem[] {
  return items.flatMap((item) => [item, ...flatten(item.children)])
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export function usePlanReviewHeadingJump({
  items,
  scrollContainerRef
}: {
  items: readonly MarkdownTocItem[]
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>
}): { jumpToHeading: (id: string) => void; glow: PlanReviewHeadingGlow | null } {
  const [glow, setGlow] = useState<PlanReviewHeadingGlow | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    },
    []
  )

  const jumpToHeading = useCallback(
    (id: string) => {
      const container = scrollContainerRef.current
      const heading = container
        ? findRichMarkdownTocHeadingTarget(container, flatten(items), id)
        : undefined
      if (!container || !heading) {
        return
      }
      const containerRect = container.getBoundingClientRect()
      const rect = heading.getBoundingClientRect()
      const top = rect.top - containerRect.top + container.scrollTop
      container.scrollTo({
        top: Math.max(0, top - LANDING_OFFSET_PX),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth'
      })
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
      setGlow({
        key: Date.now(),
        top: top - GLOW_PADDING_PX,
        left: rect.left - containerRect.left + container.scrollLeft - GLOW_PADDING_PX * 2,
        width: rect.width + GLOW_PADDING_PX * 4,
        height: rect.height + GLOW_PADDING_PX * 2
      })
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        setGlow(null)
      }, GLOW_MS)
    },
    [items, scrollContainerRef]
  )

  return { jumpToHeading, glow }
}
