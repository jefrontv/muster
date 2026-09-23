import { useCallback, useEffect, useRef, type RefObject } from 'react'

/** Matches the row transition in main.css, plus a frame of slack for the last measure. */
const COLLAPSE_TRANSITION_WINDOW_MS = 260

/**
 * Returns a marker to call just before a project opens or closes. It flags the list scroller for one
 * transition window so rows slide and newly revealed rows fade in (main.css); scrolling, filtering
 * and first load stay instant because the flag is only up around a user toggle.
 */
export function useSidebarCollapseTransition(scrollRef: RefObject<HTMLElement | null>): () => void {
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current)
    },
    []
  )

  return useCallback(() => {
    const node = scrollRef.current
    if (!node) {
      return
    }
    // Why: set before the state change so the rows React inserts already match @starting-style.
    node.dataset.collapseTransition = 'true'
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      delete node.dataset.collapseTransition
    }, COLLAPSE_TRANSITION_WINDOW_MS)
  }, [scrollRef])
}
