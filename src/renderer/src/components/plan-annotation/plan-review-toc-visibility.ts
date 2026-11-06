import { useCallback, useState } from 'react'
import type React from 'react'

/** Below this review window width an open outline squeezes the plan text into a narrow strip. */
export const PLAN_REVIEW_TOC_MIN_MODAL_WIDTH = 1000

/** The user's open/close choice wins for the session; otherwise the outline shows when it fits. */
export function shouldShowPlanReviewTableOfContents({
  hasOutline,
  modalWidth,
  userChoice
}: {
  hasOutline: boolean
  /** Null until the window has been measured. */
  modalWidth: number | null
  userChoice: boolean | null
}): boolean {
  if (userChoice !== null) {
    return userChoice
  }
  return hasOutline && modalWidth !== null && modalWidth >= PLAN_REVIEW_TOC_MIN_MODAL_WIDTH
}

/** Tracks an element's layout width; offsetWidth ignores the dialog's zoom-in transform. */
export function usePlanReviewModalWidth(): [number | null, React.RefCallback<HTMLDivElement>] {
  const [width, setWidth] = useState<number | null>(null)
  const ref = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      return
    }
    // Measured in the commit phase, so the first paint already has the right panel state.
    setWidth(element.offsetWidth)
    const observer = new ResizeObserver(() => setWidth(element.offsetWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [width, ref]
}
