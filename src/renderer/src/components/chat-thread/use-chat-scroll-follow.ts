import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChatScrollFollow, type ChatScrollFollowState } from './chat-scroll-follow'

// Where each thread was left, so switching back returns to the same spot.
const anchors = new Map<string, { scrollTop: number; following: boolean }>()

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

export function useChatScrollFollow(threadId: string): {
  scrollRef: React.RefObject<HTMLDivElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
  state: ChatScrollFollowState
  follow: () => void
} {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const controllerRef = useRef<ChatScrollFollow | null>(null)
  const [state, setState] = useState<ChatScrollFollowState>({ following: true, away: false })

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) {
      return
    }
    const controller = new ChatScrollFollow(scroller, setState)
    controllerRef.current = controller
    const saved = anchors.get(threadId)
    if (saved && !saved.following) {
      controller.restore(saved.scrollTop)
    } else {
      controller.follow()
    }
    const intent = (): void => controller.noteIntent(performance.now())
    const onKey = (event: KeyboardEvent): void => {
      if (SCROLL_KEYS.has(event.key)) {
        intent()
      }
    }
    const onPointerDown = (event: PointerEvent): void => {
      // Clicks on content are not scrolling; only a press on the scrollbar track is.
      if (event.target === scroller) {
        controller.pointerDown()
      }
    }
    const onPointerUp = (): void => controller.pointerUp(performance.now())
    const onScroll = (): void => controller.onScroll(performance.now())
    // Test DOMs may lack ResizeObserver; follow then only reacts to scroll events.
    const resize =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => controller.onContentResize())
    resize?.observe(content)
    resize?.observe(scroller)
    scroller.addEventListener('wheel', intent, { passive: true })
    scroller.addEventListener('touchmove', intent, { passive: true })
    scroller.addEventListener('keydown', onKey)
    scroller.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      anchors.set(threadId, {
        scrollTop: scroller.scrollTop,
        following: controller.state().following
      })
      resize?.disconnect()
      scroller.removeEventListener('wheel', intent)
      scroller.removeEventListener('touchmove', intent)
      scroller.removeEventListener('keydown', onKey)
      scroller.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      scroller.removeEventListener('scroll', onScroll)
      controllerRef.current = null
    }
  }, [threadId])

  const follow = useCallback(() => controllerRef.current?.follow(), [])
  return { scrollRef, contentRef, state, follow }
}

/** Forces follow when a turn is added: in chat mode only the user's own send adds one. */
export function useFollowOnNewTurn(turnCount: number, follow: () => void): void {
  const previous = useRef(turnCount)
  useEffect(() => {
    if (turnCount > previous.current) {
      follow()
    }
    previous.current = turnCount
  }, [turnCount, follow])
}
