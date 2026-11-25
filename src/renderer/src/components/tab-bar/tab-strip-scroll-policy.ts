export type ActiveTabActivationSource = 'pointer' | 'other'

/** Share of the tab's width inside the strip viewport, 0 to 1. */
export function getVisibleFraction(
  tab: Pick<DOMRect, 'left' | 'width'>,
  strip: Pick<DOMRect, 'left' | 'width'>
): number {
  if (tab.width <= 0) {
    return 1
  }
  const visible =
    Math.min(tab.left + tab.width, strip.left + strip.width) - Math.max(tab.left, strip.left)
  return Math.max(0, Math.min(1, visible / tab.width))
}

/** Clicked tabs that are mostly visible stay put; everything else scrolls into view. */
export function shouldScrollActiveTabIntoView({
  source,
  visibleFraction
}: {
  source: ActiveTabActivationSource
  visibleFraction: number
}): boolean {
  if (visibleFraction >= 0.999) {
    return false
  }
  return source === 'pointer' ? visibleFraction < 0.5 : true
}
