import { useEffect, useMemo, useRef } from 'react'
import type { DropAnimationFunction, Modifier } from '@dnd-kit/core'
import { useAppStore } from '../../store'
import {
  TAB_SLIDE_DURATION_MS,
  TAB_SLIDE_EASING,
  prefersReducedMotion
} from '../tab-bar/tab-strip-slide'
import { isTabDragData, type TabDragItemData } from './useTabDragSplit'

/** Pins the overlay to the strip's row while the pointer is over its own strip, so it only slides sideways. */
export const lockTabDragToSourceStrip: Modifier = ({ active, over, activeNodeRect, transform }) => {
  const activeData = active?.data.current
  const overData = over?.data.current
  // Why: past about a row of vertical travel the tab is leaving for a split or another group.
  const lockRange = (activeNodeRect?.height ?? 24) * 1.5
  if (
    isTabDragData(activeData) &&
    isTabDragData(overData) &&
    overData.groupId === activeData.groupId &&
    Math.abs(transform.y) <= lockRange
  ) {
    return { ...transform, y: 0 }
  }
  return transform
}

export const TAB_DRAG_OVERLAY_MODIFIERS = [lockTabDragToSourceStrip]

// Why: the overlay always sits under the pointer; letting events through keeps the strip's edge-scroll zones reachable.
export const TAB_DRAG_OVERLAY_STYLE = { pointerEvents: 'none' } as const

function isStillInSourceGroup(drag: TabDragItemData): boolean {
  const groups = useAppStore.getState().groupsByWorktree[drag.worktreeId] ?? []
  return groups.some(
    (group) => group.id === drag.groupId && group.tabOrder.includes(drag.unifiedTabId)
  )
}

function translate(x: number, y: number): string {
  return `translate3d(${x}px, ${y}px, 0)`
}

/** Eases the overlay into the dropped tab's slot when it stays in its strip; other drops end instantly as before. */
function createTabDropSettle(getLastDrag: () => TabDragItemData | null): DropAnimationFunction {
  return ({ active, dragOverlay, transform }) => {
    const drag = getLastDrag()
    if (!drag || prefersReducedMotion() || !isStillInSourceGroup(drag)) {
      return
    }
    const finalX = transform.x - (dragOverlay.rect.left - active.rect.left)
    const finalY = transform.y - (dragOverlay.rect.top - active.rect.top)
    if (Math.abs(finalX - transform.x) < 1 && Math.abs(finalY - transform.y) < 1) {
      return
    }
    const previousOpacity = active.node.style.opacity
    active.node.style.opacity = '0'
    const animation = dragOverlay.node.animate(
      [
        { transform: translate(transform.x, transform.y) },
        { transform: translate(finalX, finalY) }
      ],
      { duration: TAB_SLIDE_DURATION_MS, easing: TAB_SLIDE_EASING, fill: 'forwards' }
    )
    const restore = (): void => {
      active.node.style.opacity = previousOpacity
    }
    return animation.finished.then(restore, restore)
  }
}

export function useTabDropSettle(activeDrag: TabDragItemData | null): DropAnimationFunction {
  // Why: activeDrag is already cleared when dnd-kit runs the drop animation.
  const lastDragRef = useRef<TabDragItemData | null>(null)
  useEffect(() => {
    if (activeDrag) {
      lastDragRef.current = activeDrag
    }
  }, [activeDrag])
  return useMemo(() => createTabDropSettle(() => lastDragRef.current), [])
}
