// Interval driver for the typewriter reveal: one word-boundary step per tick, so
// the streaming row re-parses its markdown ~25 times a second, not every frame.

import { useEffect, useRef, useState } from 'react'
import {
  nextTypewriterReveal,
  typewriterNeedsReset,
  TYPEWRITER_TICK_MS
} from './native-chat-typewriter'

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
    let last = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const next = nextTypewriterReveal(target, displayedRef.current, now - last, settled)
      last = now
      if (next !== displayedRef.current) {
        displayedRef.current = next
        setDisplayed(next)
      }
      if (next >= target.length) {
        window.clearInterval(timer)
      }
    }, TYPEWRITER_TICK_MS)
    return () => window.clearInterval(timer)
  }, [target, settled])

  if (target === null) {
    return null
  }
  const visible = target.slice(0, displayed)
  return visible === '' ? null : visible
}
