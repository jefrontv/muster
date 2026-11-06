// Open/collapsed state of the drafts panel: remembered across launches, opened when drafts first arrive.
import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'muster.bots.commentDraftsPanelOpen'
/** Below this page width the panel overlays the webview instead of taking a column. */
export const BOTS_DRAFTS_OVERLAY_BELOW_PX = 860

function readStoredOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

function storeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0')
  } catch {
    // Not remembered this time; the panel still works.
  }
}

/** `waiting` is null until the first list read lands, so a remembered collapse survives startup. */
export function useBotsCommentDraftsPanel(waiting: number | null): {
  open: boolean
  setOpen: (open: boolean) => void
} {
  const [open, setOpenState] = useState(readStoredOpen)
  const previous = useRef<number | null>(null)

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    storeOpen(next)
  }, [])

  useEffect(() => {
    const before = previous.current
    previous.current = waiting
    if (before === 0 && waiting !== null && waiting > 0) {
      setOpen(true)
    }
  }, [setOpen, waiting])

  return { open, setOpen }
}

/** True while the element is narrower than the overlay breakpoint. */
export function useBotsDraftsOverlay(element: HTMLElement | null): boolean {
  const [overlay, setOverlay] = useState(false)
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') {
      return
    }
    const measure = (): void => setOverlay(element.clientWidth < BOTS_DRAFTS_OVERLAY_BELOW_PX)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return overlay
}
