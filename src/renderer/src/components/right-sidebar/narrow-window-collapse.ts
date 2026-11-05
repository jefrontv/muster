import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { addViewportSizeChangeListener } from '@/hooks/viewport-size-change-listener'

export const NARROW_WINDOW_WIDTH = 960

/**
 * Folds the right sidebar to its activity bar when the window narrows past the breakpoint and
 * restores it on widening. The store's auto-fold flag carries the state, and any user toggle clears it.
 */
export function createNarrowWindowCollapse({
  getWidth,
  setAutoFolded
}: {
  getWidth: () => number
  setAutoFolded: (folded: boolean) => void
}): () => void {
  let narrow = false
  return () => {
    const nowNarrow = getWidth() < NARROW_WINDOW_WIDTH
    if (nowNarrow !== narrow) {
      narrow = nowNarrow
      setAutoFolded(narrow)
    }
  }
}

/** Mounted in App so Settings, Sites and Bots, which unmount the right sidebar, keep the fold. */
export function useNarrowWindowRightSidebarCollapse(): void {
  useEffect(() => {
    const onResize = createNarrowWindowCollapse({
      getWidth: () => window.innerWidth,
      setAutoFolded: (folded) => useAppStore.getState().setRightSidebarAutoFolded(folded)
    })
    onResize()
    return addViewportSizeChangeListener(onResize)
  }, [])
}
