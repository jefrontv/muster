export type DropIndicator = 'left' | 'right' | null

// Why: vivid info blue reads against every fill; the 3px offset centres the 2px bar in the 4px gap without moving layout.
export function getDropIndicatorClasses(dropIndicator: DropIndicator): string {
  if (dropIndicator === 'left') {
    return "before:absolute before:top-1/2 before:-left-[3px] before:z-10 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-status-info before:content-['']"
  }
  if (dropIndicator === 'right') {
    return "after:absolute after:top-1/2 after:-right-[3px] after:z-10 after:h-4 after:w-0.5 after:-translate-y-1/2 after:rounded-full after:bg-status-info after:content-['']"
  }
  return ''
}
