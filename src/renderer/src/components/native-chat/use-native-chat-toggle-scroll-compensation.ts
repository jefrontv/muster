import { useCallback, useLayoutEffect, useRef } from 'react'
import { isWithinFollowRearmBand, resolveToggleCompensation } from './native-chat-scroll-anchoring'

/** Data attribute the timeline's scroll container carries so toggled rows can
 *  find it without prop-drilling a ref through every row. */
export const NATIVE_CHAT_SCROLL_CONTAINER_ATTR = 'data-native-chat-scroll'

/**
 * Keeps a toggled element (tool run, fold row) visually still when its
 * expand/collapse re-layout would shift it: capture its viewport top in the
 * click handler, then after the re-render scroll the container by the shift.
 * Skipped while pinned in the follow band — there the bottom-follow owns the
 * viewport and a correction would fight it.
 */
export function useNativeChatToggleScrollCompensation(open: boolean): {
  elementRef: React.RefObject<HTMLDivElement | null>
  /** Call synchronously in the click handler, before flipping the state. */
  captureBeforeToggle: () => void
} {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const pendingTopRef = useRef<number | null>(null)

  const captureBeforeToggle = useCallback(() => {
    pendingTopRef.current = elementRef.current?.getBoundingClientRect().top ?? null
  }, [])

  useLayoutEffect(() => {
    const previousTop = pendingTopRef.current
    pendingTopRef.current = null
    const el = elementRef.current
    if (previousTop === null || !el) {
      return
    }
    const container = el.closest<HTMLElement>(`[${NATIVE_CHAT_SCROLL_CONTAINER_ATTR}]`)
    if (!container) {
      return
    }
    if (isWithinFollowRearmBand(container)) {
      return
    }
    const delta = resolveToggleCompensation(previousTop, el.getBoundingClientRect().top)
    if (delta !== 0) {
      container.scrollTop += delta
    }
  }, [open])

  return { elementRef, captureBeforeToggle }
}
