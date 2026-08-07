import { useCallback, useEffect, useRef, useState } from 'react'
import {
  NATIVE_CHAT_ANCHOR_TOP_OFFSET_PX,
  NATIVE_CHAT_JUMP_SHOW_DEBOUNCE_MS,
  resolveAnchorSpacerPx,
  resolveModeAfterGesture,
  resolveModeAfterScroll,
  resolveModeAfterTurnSettled,
  resolveRevealDelta,
  shouldShowJumpToLatest,
  type NativeChatScrollGesture,
  type NativeChatScrollMode,
  type ScrollGeometry
} from './native-chat-scroll-anchoring'

function geometryOf(el: HTMLElement): ScrollGeometry {
  return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
}

/** Fallback for browsers/frames where 'scrollend' never fires mid-animation. */
const ANCHOR_SMOOTH_SCROLL_FALLBACK_MS = 750

/**
 * Owns the timeline's three-mode scroll behavior: bottom-follow with a strict
 * re-arm band, new-turn anchoring (user message held near the viewport top,
 * reply streaming into reserved space below), and free-scrolling with the
 * debounced "jump to latest" pill. The pure decisions live in
 * native-chat-scroll-anchoring.ts; this hook wires them to the DOM.
 */
export function useNativeChatScrollAnchoring(input: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
  /** End-of-content spacer whose height this hook writes while anchoring. */
  spacerRef: React.RefObject<HTMLDivElement | null>
  isWorking: boolean
}): {
  mode: NativeChatScrollMode
  showJumpToLatest: boolean
  onScroll: () => void
  onWheel: (event: React.WheelEvent) => void
  onKeyDown: (event: React.KeyboardEvent) => void
  onPointerDown: (event: React.PointerEvent) => void
  scrollToEnd: () => void
  /** Current mode without waiting for a re-render (layout-effect reads). */
  getMode: () => NativeChatScrollMode
  /** Synchronously detach follow before a deliberate programmatic scroll. */
  breakToFreeScrolling: () => void
  /** Enter anchoring-new-turn for the given (already rendered) message row. */
  anchorToMessage: (messageId: string) => void
  /** Re-assert the active mode after content growth/shrink (layout effects + ResizeObserver). */
  maintainAfterRender: () => void
} {
  const { scrollRef, contentRef, spacerRef, isWorking } = input
  const [mode, setModeState] = useState<NativeChatScrollMode>('following-end')
  const modeRef = useRef<NativeChatScrollMode>('following-end')
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const jumpShownRef = useRef(false)
  const jumpTimerRef = useRef<number | null>(null)
  // True from the anchoring smooth scroll until it settles; reveal scrolls
  // must not fire mid-animation (an instant += would kill the smoothness).
  const anchorScrollPendingRef = useRef(false)
  const anchorSettleCleanupRef = useRef<(() => void) | null>(null)

  const setSpacerHeight = useCallback(
    (px: number) => {
      const spacer = spacerRef.current
      if (spacer) {
        spacer.style.height = px > 0 ? `${px}px` : '0px'
      }
    },
    [spacerRef]
  )

  const hideJump = useCallback(() => {
    if (jumpTimerRef.current !== null) {
      window.clearTimeout(jumpTimerRef.current)
      jumpTimerRef.current = null
    }
    if (jumpShownRef.current) {
      jumpShownRef.current = false
      setShowJumpToLatest(false)
    }
  }, [])

  // 150ms show debounce, instant hide: a transient pass through the away-band
  // (e.g. layout shuffle) must not flash the pill.
  const updateJump = useCallback(
    (geometry: ScrollGeometry) => {
      if (!shouldShowJumpToLatest(modeRef.current, geometry)) {
        hideJump()
        return
      }
      if (jumpShownRef.current || jumpTimerRef.current !== null) {
        return
      }
      jumpTimerRef.current = window.setTimeout(() => {
        jumpTimerRef.current = null
        const el = scrollRef.current
        if (el && shouldShowJumpToLatest(modeRef.current, geometryOf(el))) {
          jumpShownRef.current = true
          setShowJumpToLatest(true)
        }
      }, NATIVE_CHAT_JUMP_SHOW_DEBOUNCE_MS)
    },
    [hideJump, scrollRef]
  )

  const applyMode = useCallback(
    (next: NativeChatScrollMode) => {
      if (next === modeRef.current) {
        return
      }
      const leavingAnchor = modeRef.current === 'anchoring-new-turn'
      modeRef.current = next
      setModeState(next)
      if (leavingAnchor) {
        anchorScrollPendingRef.current = false
        anchorSettleCleanupRef.current?.()
        setSpacerHeight(0)
      }
    },
    [setSpacerHeight]
  )

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    const geometry = geometryOf(el)
    applyMode(resolveModeAfterScroll(modeRef.current, geometry))
    updateJump(geometry)
  }, [applyMode, scrollRef, updateJump])

  const onGesture = useCallback(
    (gesture: NativeChatScrollGesture) => {
      const el = scrollRef.current
      if (!el) {
        return
      }
      const geometry = geometryOf(el)
      applyMode(resolveModeAfterGesture(modeRef.current, gesture, geometry))
      updateJump(geometry)
    },
    [applyMode, scrollRef, updateJump]
  )

  const onWheel = useCallback(
    (event: React.WheelEvent) => {
      // Only an upward wheel is navigation intent; wheeling down while
      // following either does nothing (at the end) or moves toward it.
      if (event.deltaY < 0) {
        onGesture('wheel-up')
      }
    },
    [onGesture]
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Keyboard scrolling bypasses wheel/pointer events entirely; without
      // this the timeline yanks back to the end on the next stream chunk.
      if (event.key === 'PageUp' || event.key === 'Home' || event.key === 'ArrowUp') {
        onGesture('scroll-key')
      }
    },
    [onGesture]
  )

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Scrollbar drags are the only pointerdowns whose target is the scroll
      // node itself rather than a message row.
      onGesture(event.target === scrollRef.current ? 'pointer-scrollbar' : 'pointer-content')
    },
    [onGesture, scrollRef]
  )

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    applyMode('following-end')
    el.scrollTop = el.scrollHeight
    hideJump()
  }, [applyMode, hideJump, scrollRef])

  const getMode = useCallback(() => modeRef.current, [])

  // Why: a deliberate programmatic scroll (e.g. "scroll this message to top")
  // must detach synchronously — waiting for its scroll events leaves a window
  // where a streaming growth re-pins the bottom and fights the animation.
  const breakToFreeScrolling = useCallback(() => {
    applyMode('free-scrolling')
  }, [applyMode])

  // Recompute the reserved end space so the anchored user row can sit at the
  // viewport top while the reply is still short; shrinks as content fills in.
  const updateAnchorSpacer = useCallback(
    (anchorEl: HTMLElement) => {
      const el = scrollRef.current
      const content = contentRef.current
      if (!el || !content) {
        return
      }
      const contentRect = content.getBoundingClientRect()
      const currentSpacer = spacerRef.current?.getBoundingClientRect().height ?? 0
      setSpacerHeight(
        resolveAnchorSpacerPx({
          viewportHeight: el.clientHeight,
          anchorTop: anchorEl.getBoundingClientRect().top - contentRect.top,
          contentHeightWithoutSpacer: contentRect.height - currentSpacer
        })
      )
    },
    [contentRef, scrollRef, setSpacerHeight, spacerRef]
  )

  const findAnchorEl = useCallback(
    (messageId: string): HTMLElement | null =>
      contentRef.current?.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(messageId)}"]`
      ) ?? null,
    [contentRef]
  )

  const anchorMessageIdRef = useRef<string | null>(null)

  const anchorToMessage = useCallback(
    (messageId: string) => {
      const el = scrollRef.current
      const anchorEl = findAnchorEl(messageId)
      if (!el || !anchorEl) {
        return
      }
      anchorMessageIdRef.current = messageId
      applyMode('anchoring-new-turn')
      hideJump()
      updateAnchorSpacer(anchorEl)
      const targetTop =
        anchorEl.getBoundingClientRect().top -
        el.getBoundingClientRect().top +
        el.scrollTop -
        NATIVE_CHAT_ANCHOR_TOP_OFFSET_PX
      anchorScrollPendingRef.current = true
      anchorSettleCleanupRef.current?.()
      const settle = (): void => {
        anchorScrollPendingRef.current = false
        anchorSettleCleanupRef.current?.()
      }
      const fallback = window.setTimeout(settle, ANCHOR_SMOOTH_SCROLL_FALLBACK_MS)
      el.addEventListener('scrollend', settle, { once: true })
      anchorSettleCleanupRef.current = () => {
        window.clearTimeout(fallback)
        el.removeEventListener('scrollend', settle)
        anchorSettleCleanupRef.current = null
      }
      el.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
    },
    [applyMode, findAnchorEl, hideJump, scrollRef, updateAnchorSpacer]
  )

  const maintainAfterRender = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    if (modeRef.current === 'following-end') {
      if (el.scrollTop + el.clientHeight < el.scrollHeight) {
        el.scrollTop = el.scrollHeight
      }
      hideJump()
      return
    }
    if (modeRef.current === 'anchoring-new-turn') {
      const anchorEl = anchorMessageIdRef.current ? findAnchorEl(anchorMessageIdRef.current) : null
      if (anchorEl) {
        updateAnchorSpacer(anchorEl)
      }
      if (!anchorScrollPendingRef.current) {
        const spacer = spacerRef.current?.getBoundingClientRect().height ?? 0
        const delta = resolveRevealDelta({
          scrollTop: el.scrollTop,
          viewportHeight: el.clientHeight,
          contentBottom: el.scrollHeight - spacer
        })
        if (delta > 0) {
          el.scrollTop += delta
        }
      }
      return
    }
    updateJump(geometryOf(el))
  }, [findAnchorEl, hideJump, scrollRef, spacerRef, updateAnchorSpacer, updateJump])

  // The turn settling ends anchoring: hand off to follow at the live edge,
  // otherwise leave the reader where they are.
  useEffect(() => {
    if (isWorking) {
      return
    }
    const el = scrollRef.current
    if (!el) {
      return
    }
    anchorMessageIdRef.current = null
    applyMode(resolveModeAfterTurnSettled(modeRef.current, geometryOf(el)))
  }, [applyMode, isWorking, scrollRef])

  // In-place content growth (a streaming message extending itself) never
  // changes the row count, so observe sizes to keep the active mode asserted.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => maintainAfterRender())
    observer.observe(el)
    if (contentRef.current) {
      observer.observe(contentRef.current)
    }
    return () => observer.disconnect()
  }, [contentRef, maintainAfterRender, scrollRef])

  useEffect(() => {
    return () => {
      if (jumpTimerRef.current !== null) {
        window.clearTimeout(jumpTimerRef.current)
      }
      anchorSettleCleanupRef.current?.()
    }
  }, [])

  return {
    mode,
    showJumpToLatest,
    onScroll,
    onWheel,
    onKeyDown,
    onPointerDown,
    scrollToEnd,
    getMode,
    breakToFreeScrolling,
    anchorToMessage,
    maintainAfterRender
  }
}
