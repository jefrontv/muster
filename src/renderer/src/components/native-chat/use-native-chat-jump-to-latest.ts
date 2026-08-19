// The timeline's "jump to latest" pill: whether it is showing, and the debounce
// that keeps it from flashing. Split out of the anchoring hook because it is the
// one piece of that state the scroll model never reads back — it only writes it.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  NATIVE_CHAT_JUMP_SHOW_DEBOUNCE_MS,
  shouldShowJumpToLatest,
  type NativeChatScrollMode,
  type ScrollGeometry
} from './native-chat-scroll-anchoring'

export type NativeChatJumpToLatest = {
  showJumpToLatest: boolean
  /** Re-evaluate against fresh geometry; debounced on the way in. */
  updateJump: (geometry: ScrollGeometry) => void
  /** Hide immediately and drop any pending show. */
  hideJump: () => void
}

export function useNativeChatJumpToLatest(input: {
  getMode: () => NativeChatScrollMode
  /** Re-read at debounce time, since the geometry may have moved on. */
  readGeometry: () => ScrollGeometry | null
}): NativeChatJumpToLatest {
  const { getMode, readGeometry } = input
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const shownRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  const hideJump = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (shownRef.current) {
      shownRef.current = false
      setShowJumpToLatest(false)
    }
  }, [])

  // 150ms show debounce, instant hide: a transient pass through the away-band
  // (e.g. layout shuffle) must not flash the pill.
  const updateJump = useCallback(
    (geometry: ScrollGeometry) => {
      if (!shouldShowJumpToLatest(getMode(), geometry)) {
        hideJump()
        return
      }
      if (shownRef.current || timerRef.current !== null) {
        return
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        const fresh = readGeometry()
        if (fresh && shouldShowJumpToLatest(getMode(), fresh)) {
          shownRef.current = true
          setShowJumpToLatest(true)
        }
      }, NATIVE_CHAT_JUMP_SHOW_DEBOUNCE_MS)
    },
    [getMode, hideJump, readGeometry]
  )

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  return { showJumpToLatest, updateJump, hideJump }
}
