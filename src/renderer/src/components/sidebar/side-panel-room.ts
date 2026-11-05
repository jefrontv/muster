import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import {
  RIGHT_SIDEBAR_MIN_NON_SIDEBAR_AREA,
  RIGHT_SIDEBAR_MIN_WIDTH
} from '../right-sidebar/right-sidebar-width'

export const LEFT_SIDEBAR_MIN_WIDTH = 220
export const ACTIVITY_BAR_SIDE_WIDTH = 40

/** The left sidebar gives up width, down to its floor, before the centre pane drops below its reserve. */
export function fitLeftSidebarWidth(
  width: number,
  windowWidth: number | null,
  rightReserve: number
): number {
  if (windowWidth === null) {
    return width
  }
  const room = windowWidth - rightReserve - RIGHT_SIDEBAR_MIN_NON_SIDEBAR_AREA
  return Math.min(width, Math.max(LEFT_SIDEBAR_MIN_WIDTH, room))
}

function readWindowWidth(): number | null {
  if (typeof window === 'undefined' || !Number.isFinite(window.innerWidth)) {
    return null
  }
  return window.innerWidth
}

// Persisted panel widths can outlive the window they were chosen in, so layout clamps from the live width.
export function useWindowWidth(): number | null {
  const [windowWidth, setWindowWidth] = useState(readWindowWidth)
  useEffect(() => {
    const update = (): void => setWindowWidth(readWindowWidth())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return windowWidth
}

/** The left sidebar's drawn width (0 when closed); drawers and the right sidebar line up against it. */
export function useRenderedLeftSidebarWidth(): number {
  const windowWidth = useWindowWidth()
  const open = useAppStore((s) => s.sidebarOpen)
  const width = useAppStore((s) => s.sidebarWidth)
  const rightReserve = useAppStore((s) =>
    s.rightSidebarOpen
      ? RIGHT_SIDEBAR_MIN_WIDTH + (s.activityBarPosition === 'side' ? ACTIVITY_BAR_SIDE_WIDTH : 0)
      : 0
  )
  return open ? fitLeftSidebarWidth(width, windowWidth, rightReserve) : 0
}
