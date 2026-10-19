import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export const TURN_PAGE = 30
// Reveal the next page before the reader reaches the top, so it is there when they arrive.
const REVEAL_MARGIN_PX = 600

// Pages revealed per thread, so switching back keeps the saved scroll position meaningful.
const revealed = new Map<string, number>()

/** Keeps what the reader sees in place when content is added above it. */
export function anchoredScrollTop(
  before: { scrollHeight: number; scrollTop: number },
  afterScrollHeight: number
): number {
  return afterScrollHeight - (before.scrollHeight - before.scrollTop)
}

/** History the store doesn't hold yet, fetched on demand (Code mode's transcript pages). */
export type ChatEarlierHistory = { hasMore: boolean; loading: boolean; load: () => void }

export function useChatTurnPaging(
  threadId: string,
  order: string[],
  scrollRef: React.RefObject<HTMLDivElement | null>,
  earlier?: ChatEarlierHistory
): {
  visible: string[]
  hasEarlier: boolean
  sentinelRef: React.RefObject<HTMLDivElement | null>
  /** Makes sure a turn is rendered; returns false for an unknown turn. */
  revealTurn: (turnId: string) => boolean
} {
  const [count, setCount] = useState(() => revealed.get(threadId) ?? TURN_PAGE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const anchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)

  useEffect(() => {
    revealed.set(threadId, count)
  }, [threadId, count])

  const hasEarlier = order.length > count
  const canFetch = !hasEarlier && earlier?.hasMore === true && !earlier.loading
  const loadEarlier = earlier?.load
  // Set while a fetch is out; its turns land at the front of `order`.
  const fetchAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)
  const firstTurn = order[0]

  useEffect(() => {
    const scroller = scrollRef.current
    const sentinel = sentinelRef.current
    if (
      !scroller ||
      !sentinel ||
      !(hasEarlier || canFetch) ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return
        }
        const anchor = { scrollHeight: scroller.scrollHeight, scrollTop: scroller.scrollTop }
        if (hasEarlier) {
          anchorRef.current = anchor
          setCount((current) => current + TURN_PAGE)
          return
        }
        observer.disconnect()
        fetchAnchorRef.current = anchor
        loadEarlier?.()
      },
      { root: scroller, rootMargin: `${REVEAL_MARGIN_PX}px 0px 0px 0px` }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [scrollRef, hasEarlier, canFetch, loadEarlier, count, firstTurn])

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const anchor = fetchAnchorRef.current
    fetchAnchorRef.current = null
    if (scroller && anchor) {
      scroller.scrollTop = anchoredScrollTop(anchor, scroller.scrollHeight)
    }
  }, [firstTurn, scrollRef])

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const anchor = anchorRef.current
    anchorRef.current = null
    if (scroller && anchor) {
      scroller.scrollTop = anchoredScrollTop(anchor, scroller.scrollHeight)
    }
  }, [count, scrollRef])

  const revealTurn = useCallback(
    (turnId: string) => {
      const index = order.indexOf(turnId)
      if (index < 0) {
        return false
      }
      const needed = order.length - index
      setCount((current) => Math.max(current, needed))
      return true
    },
    [order]
  )

  return {
    visible: hasEarlier ? order.slice(-count) : order,
    hasEarlier: hasEarlier || canFetch,
    sentinelRef,
    revealTurn
  }
}
