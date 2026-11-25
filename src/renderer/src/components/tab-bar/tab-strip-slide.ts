import type { CSSProperties } from 'react'
import type { HoveredTabInsertion } from '../tab-group/tab-insertion'

/** How far a tab in the dragged tab's own strip sits from its resting slot, in whole slots. */
export type TabSlide = { slots: number; isSource: boolean }

// Why: matches the strip's gap-1, so one slot is a tab width plus the gap.
const TAB_STRIP_GAP = '0.25rem'
export const TAB_SLIDE_DURATION_MS = 180
export const TAB_SLIDE_EASING = 'cubic-bezier(0.2, 0, 0, 1)'

export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** Slot offsets that preview a same-strip drop; the index math mirrors onDragEnd's reorder. */
export function computeTabSlides(
  orderedIds: readonly string[],
  sourceId: string | null,
  insertion: HoveredTabInsertion | null
): Map<string, TabSlide> {
  const slides = new Map<string, TabSlide>()
  const sourceIndex = sourceId === null ? -1 : orderedIds.indexOf(sourceId)
  if (sourceIndex === -1) {
    return slides
  }
  let target = sourceIndex
  const overIndex = insertion ? orderedIds.indexOf(insertion.visibleTabId) : -1
  if (insertion && overIndex !== -1) {
    const rawInsert = overIndex + (insertion.side === 'right' ? 1 : 0)
    target = sourceIndex < rawInsert ? rawInsert - 1 : rawInsert
  }
  orderedIds.forEach((id, index) => {
    if (index === sourceIndex) {
      slides.set(id, { slots: target - sourceIndex, isSource: true })
    } else if (index > sourceIndex && index <= target) {
      slides.set(id, { slots: -1, isSource: false })
    } else if (index < sourceIndex && index >= target) {
      slides.set(id, { slots: 1, isSource: false })
    } else {
      slides.set(id, { slots: 0, isSource: false })
    }
  })
  return slides
}

export function getTabSlideStyle(slide: TabSlide | null | undefined): CSSProperties | undefined {
  if (!slide) {
    return undefined
  }
  return {
    transform:
      slide.slots === 0
        ? undefined
        : `translateX(calc(${slide.slots} * (100% + ${TAB_STRIP_GAP})))`,
    transition: prefersReducedMotion()
      ? undefined
      : `transform ${TAB_SLIDE_DURATION_MS}ms ${TAB_SLIDE_EASING}`,
    // Why: the drag overlay stands in for the source tab, so its slot reads as the gap it will drop into.
    opacity: slide.isSource ? 0 : undefined
  }
}
