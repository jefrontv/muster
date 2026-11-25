import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { bindTabStripContentResizeObservers } from './tab-strip-content-resize-observers'
import {
  computeTabStripScrollMetrics,
  sameTabStripScrollMetrics,
  type TabStripScrollMetrics
} from './tab-strip-scroll-metrics'
import {
  isTabStripPointerGestureActive,
  takeTabStripPointerActivation
} from './tab-strip-pointer-gesture'
import { getVisibleFraction, shouldScrollActiveTabIntoView } from './tab-strip-scroll-policy'

const TAB_STRIP_SCROLL_FRACTION = 0.75
const TAB_STRIP_MIN_SCROLL_STEP_PX = 120

export function scrollTabStripByStep(
  el: HTMLElement,
  direction: 'start' | 'end',
  behavior: ScrollBehavior = 'smooth'
): void {
  const scrollStep = Math.max(
    TAB_STRIP_MIN_SCROLL_STEP_PX,
    el.clientWidth * TAB_STRIP_SCROLL_FRACTION
  )
  el.scrollBy({
    left: direction === 'start' ? -scrollStep : scrollStep,
    behavior
  })
}

const EMPTY_TAB_STRIP_OVERFLOW_STATE: TabStripScrollMetrics = {
  hasOverflow: false,
  canScrollStart: false,
  canScrollEnd: false,
  thumbSizeFraction: 1,
  thumbOffsetFraction: 0
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export function useTabStripOverflowNavigation({
  activeVisibleTabId,
  layoutKey,
  tabCount,
  worktreeId
}: {
  activeVisibleTabId: string | null
  layoutKey: string
  tabCount: number
  worktreeId: string
}): {
  tabStripRef: RefObject<HTMLDivElement | null>
  tabStripOverflowState: TabStripScrollMetrics
  scrollTabStrip: (direction: 'start' | 'end', behavior?: ScrollBehavior) => void
} {
  const tabStripRef = useRef<HTMLDivElement>(null)
  const scrolledWorktreeRef = useRef<string | null>(null)
  const [tabStripOverflowState, setTabStripOverflowState] = useState<TabStripScrollMetrics>(
    EMPTY_TAB_STRIP_OVERFLOW_STATE
  )
  const updateTabStripOverflowState = useCallback((): void => {
    const el = tabStripRef.current
    if (!el) {
      return
    }
    const next = computeTabStripScrollMetrics(el)
    setTabStripOverflowState((previous) =>
      sameTabStripScrollMetrics(previous, next) ? previous : next
    )
  }, [])
  const scrollTabStrip = useCallback(
    (direction: 'start' | 'end', behavior: ScrollBehavior = 'smooth'): void => {
      const el = tabStripRef.current
      if (!el) {
        return
      }
      scrollTabStripByStep(el, direction, behavior)
    },
    []
  )

  useEffect(() => {
    const el = tabStripRef.current
    if (!el) {
      return
    }
    const onWheel = (e: WheelEvent): void => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
        updateTabStripOverflowState()
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('scroll', updateTabStripOverflowState, { passive: true })
    updateTabStripOverflowState()
    const disconnectResizeObservers = bindTabStripContentResizeObservers(
      el,
      updateTabStripOverflowState
    )
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scroll', updateTabStripOverflowState)
      disconnectResizeObservers()
    }
  }, [updateTabStripOverflowState])

  useLayoutEffect(() => {
    updateTabStripOverflowState()
    requestAnimationFrame(updateTabStripOverflowState)
  }, [layoutKey, tabCount, updateTabStripOverflowState, worktreeId])

  useLayoutEffect(() => {
    const strip = tabStripRef.current
    if (!strip || !activeVisibleTabId) {
      return
    }
    const activeTab = strip.querySelector<HTMLElement>(
      `[data-tab-id="${CSS.escape(activeVisibleTabId)}"]`
    )
    if (!activeTab) {
      return
    }
    if (isTabStripPointerGestureActive()) {
      // Why: a press must not move the strip under a stationary pointer before release decides click or drag.
      requestAnimationFrame(updateTabStripOverflowState)
      return
    }
    const worktreeChanged = scrolledWorktreeRef.current !== worktreeId
    scrolledWorktreeRef.current = worktreeId
    const source = takeTabStripPointerActivation() ? 'pointer' : 'other'
    const visibleFraction = getVisibleFraction(
      activeTab.getBoundingClientRect(),
      strip.getBoundingClientRect()
    )
    if (shouldScrollActiveTabIntoView({ source, visibleFraction })) {
      activeTab.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: worktreeChanged || prefersReducedMotion() ? 'auto' : 'smooth'
      })
    }
    requestAnimationFrame(updateTabStripOverflowState)
  }, [activeVisibleTabId, updateTabStripOverflowState, worktreeId])

  return { tabStripRef, tabStripOverflowState, scrollTabStrip }
}
