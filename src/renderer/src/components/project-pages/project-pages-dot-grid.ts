// Dot grid behind the diagram editor and the page map; pans and zooms with the view.

/** Background for a view drawn at `scale` and offset by (x, y) screen pixels; coarser far out. */
export function dotGridStyle(
  scale: number,
  x: number,
  y: number
): Pick<CSSStyleDeclaration, 'backgroundImage' | 'backgroundSize' | 'backgroundPosition'> {
  const fine = 10 * scale
  const step = fine < 8 ? fine * 5 : fine
  return {
    backgroundImage:
      'radial-gradient(circle, color-mix(in srgb, var(--foreground) 16%, transparent) 1px, transparent 1.2px)',
    backgroundSize: `${step}px ${step}px`,
    backgroundPosition: `${x}px ${y}px`
  }
}
