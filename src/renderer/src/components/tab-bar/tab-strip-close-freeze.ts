import { useCallback, useEffect, useRef, type RefObject } from 'react'

const RELEASE_TRANSITION = 'width 150ms cubic-bezier(0.4, 0, 0.2, 1)'

/**
 * Closing a tab in a scrolled strip makes the browser clamp scrollLeft, which slides
 * every tab under the pointer. A trailing spacer the size of the closed tab keeps
 * them still until the pointer leaves the strip.
 */
export function computeCloseFreezeSpacer({
  pointerInside,
  lastScrollLeft,
  removedWidth,
  currentSpacer
}: {
  pointerInside: boolean
  lastScrollLeft: number
  removedWidth: number
  currentSpacer: number
}): number {
  if (!pointerInside || lastScrollLeft <= 0 || removedWidth <= 0) {
    return currentSpacer
  }
  return currentSpacer + removedWidth
}

type FreezeState = {
  pointerInside: boolean
  lastScrollLeft: number
  lastContentWidth: number
  spacer: number
}

export function useTabStripCloseFreeze(
  stripRef: RefObject<HTMLDivElement | null>,
  spacerRef: RefObject<HTMLDivElement | null>,
  resetKey: string
): { onPointerEnter: () => void; onPointerLeave: () => void; onPointerDownCapture: () => void } {
  const stateRef = useRef<FreezeState>({
    pointerInside: false,
    lastScrollLeft: 0,
    lastContentWidth: 0,
    spacer: 0
  })

  const setSpacer = useCallback(
    (width: number, transition: string): void => {
      const spacer = spacerRef.current
      stateRef.current.spacer = width
      if (spacer) {
        spacer.style.transition = transition
        spacer.style.width = `${width}px`
      }
    },
    [spacerRef]
  )

  useEffect(() => {
    const strip = stripRef.current
    if (!strip) {
      return
    }
    const state = stateRef.current
    setSpacer(0, 'none')
    const contentWidth = (): number => strip.scrollWidth - state.spacer
    state.lastContentWidth = contentWidth()
    state.lastScrollLeft = strip.scrollLeft
    const onScroll = (): void => {
      state.lastScrollLeft = strip.scrollLeft
    }
    // Why: runs before paint, so the spacer lands in the same frame as the removal.
    const observer = new MutationObserver(() => {
      const nextContentWidth = contentWidth()
      const removedWidth = state.lastContentWidth - nextContentWidth
      state.lastContentWidth = nextContentWidth
      const nextSpacer = computeCloseFreezeSpacer({
        pointerInside: state.pointerInside,
        lastScrollLeft: state.lastScrollLeft,
        removedWidth,
        currentSpacer: state.spacer
      })
      if (nextSpacer === state.spacer) {
        state.lastScrollLeft = strip.scrollLeft
        return
      }
      setSpacer(nextSpacer, 'none')
      strip.scrollLeft = state.lastScrollLeft
    })
    observer.observe(strip, { childList: true })
    strip.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      strip.removeEventListener('scroll', onScroll)
    }
  }, [resetKey, setSpacer, stripRef])

  const onPointerEnter = useCallback((): void => {
    stateRef.current.pointerInside = true
  }, [])

  // Why: scroll events wait for a rendered frame, so record the offset at the press that may close a tab.
  const onPointerDownCapture = useCallback((): void => {
    stateRef.current.pointerInside = true
    stateRef.current.lastScrollLeft = stripRef.current?.scrollLeft ?? 0
  }, [stripRef])

  const onPointerLeave = useCallback((): void => {
    stateRef.current.pointerInside = false
    if (stateRef.current.spacer === 0) {
      return
    }
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    setSpacer(0, reduceMotion ? 'none' : RELEASE_TRANSITION)
  }, [setSpacer])

  return { onPointerEnter, onPointerLeave, onPointerDownCapture }
}
