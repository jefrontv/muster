// rAF driver for the typewriter reveal. State updates are bounded to the one
// memoized streaming row, so a 60fps reveal re-renders exactly one markdown
// tree — the same isolation the delta path already relies on.

import { useEffect, useRef, useState } from 'react'
import { nextTypewriterCount, typewriterNeedsReset } from './native-chat-typewriter'

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Reveal `target` progressively; returns the visible prefix (null while empty
 *  so the working row shows until the first character lands). `settled` makes
 *  the reveal sprint to the end (message complete, transcript swap imminent). */
export function useNativeChatTypewriter(target: string | null, settled: boolean): string | null {
  const [displayed, setDisplayed] = useState(0)
  const previousTargetRef = useRef<string | null>(null)
  const displayedRef = useRef(0)
  displayedRef.current = displayed

  useEffect(() => {
    if (target === null) {
      previousTargetRef.current = null
      displayedRef.current = 0
      setDisplayed(0)
      return
    }
    if (typewriterNeedsReset(previousTargetRef.current, displayedRef.current, target)) {
      displayedRef.current = 0
      setDisplayed(0)
    }
    previousTargetRef.current = target
    if (prefersReducedMotion()) {
      setDisplayed(target.length)
      return
    }
    if (displayedRef.current >= target.length) {
      return
    }
    let frame = 0
    let last = performance.now()
    const tick = (now: number): void => {
      const dt = now - last
      last = now
      const next = nextTypewriterCount(displayedRef.current, target.length, dt, settled)
      if (next !== displayedRef.current) {
        displayedRef.current = next
        setDisplayed(next)
      }
      if (next < target.length) {
        frame = requestAnimationFrame(tick)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, settled])

  if (target === null) {
    return null
  }
  const visible = target.slice(0, displayed)
  return visible === '' ? null : visible
}
