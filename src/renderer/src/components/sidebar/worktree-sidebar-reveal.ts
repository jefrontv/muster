// Why only clearance: headers used to pin to the top of the list, so a revealed row had to clear a
// header's height or it landed underneath one. Nothing pins any more — the reveal just needs a few
// pixels so the row isn't flush against the edge.
export const WORKTREE_SIDEBAR_REVEAL_TOP_INSET = 6

type SidebarRevealBounds = {
  start: number
  end: number
}

function getElementScrollBounds(container: HTMLElement, element: Element): SidebarRevealBounds {
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  return {
    start: elementRect.top - containerRect.top + container.scrollTop,
    end: elementRect.bottom - containerRect.top + container.scrollTop
  }
}

export function getScrollTopToRevealBounds(
  container: HTMLElement,
  bounds: SidebarRevealBounds,
  topInset = 0
): number | null {
  const viewportTopInset = Math.max(0, Math.min(container.clientHeight, topInset))
  const viewportTop = container.scrollTop + viewportTopInset
  const viewportBottom = container.scrollTop + container.clientHeight
  if (bounds.start < viewportTop) {
    return bounds.start - viewportTopInset
  }
  if (bounds.end > viewportBottom) {
    return bounds.end - container.clientHeight
  }
  return null
}

export function revealElementInScrollContainer(
  container: HTMLElement,
  element: Element,
  behavior: ScrollBehavior
): boolean {
  if (!container.contains(element)) {
    return false
  }
  const nextScrollTop = getScrollTopToRevealBounds(
    container,
    getElementScrollBounds(container, element),
    WORKTREE_SIDEBAR_REVEAL_TOP_INSET
  )
  if (nextScrollTop === null) {
    return true
  }
  // Why: honor the user's reduced-motion preference by jumping instantly instead of
  // animating a smooth scroll (also makes the reveal deterministic in headless
  // environments that never tick the smooth-scroll animation).
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  const resolvedBehavior: ScrollBehavior =
    behavior === 'smooth' && prefersReducedMotion ? 'auto' : behavior
  container.scrollTo({ top: Math.max(0, nextScrollTop), behavior: resolvedBehavior })
  return true
}
