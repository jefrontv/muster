import type React from 'react'
import {
  MUSTER_WORDMARK_ASPECT,
  MUSTER_WORDMARK_PATH,
  MUSTER_WORDMARK_VIEWBOX
} from './muster-wordmark-path'

type MusterWordmarkProps = {
  /** Rendered height in px (cap height is about 98% of it). */
  height: number
  className?: string
}

// Outlined paths, never live text, so the UI weight cap stands and no font file is added.
export function MusterWordmark({ height, className }: MusterWordmarkProps): React.JSX.Element {
  return (
    <svg
      viewBox={MUSTER_WORDMARK_VIEWBOX}
      width={Math.round(height * MUSTER_WORDMARK_ASPECT)}
      height={height}
      className={className}
      fill="currentColor"
      role="img"
      aria-label="Muster"
    >
      <path d={MUSTER_WORDMARK_PATH} />
    </svg>
  )
}
