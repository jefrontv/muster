import type React from 'react'
import { useEffect, useRef } from 'react'

const PERCENT_LINE = /^([\w\s]+):\s+(\d+)%/
const MAX_CLONE_LOG_LINES = 60

// Percent lines are the bar's raw material and git rewrites them in place with \r, so consecutive
// updates for the same phase collapse to the latest — "Receiving objects: 42%", not 42 stacked
// rows. Everything else (Enumerating, Counting, Compressing) appends once.
export function appendCloneLogLine(prev: string[], line: string): string[] {
  const phase = line.match(PERCENT_LINE)?.[1].trim()
  const lastPhase = prev.at(-1)?.match(PERCENT_LINE)?.[1].trim()
  const base = phase !== undefined && phase === lastPhase ? prev.slice(0, -1) : prev
  return [...base, line].slice(-MAX_CLONE_LOG_LINES)
}

export function SiteCloneLog({ lines }: { lines: string[] }): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [lines])
  if (lines.length === 0) {
    return null
  }
  return (
    <div
      ref={ref}
      className="scrollbar-sleek max-h-40 overflow-y-auto overflow-x-hidden rounded-md border border-border bg-muted/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground"
    >
      {lines.map((line, index) => (
        <div key={index} className="whitespace-pre-wrap break-all">
          {line}
        </div>
      ))}
    </div>
  )
}
