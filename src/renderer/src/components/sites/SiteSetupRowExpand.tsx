import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const DURATION_MS = 200

/**
 * Animates a row's expanded area open and closed. Keeps the last content rendered while it
 * collapses, then unmounts it so closed editors leave nothing focusable behind.
 */
export function SiteSetupRowExpand({
  open,
  className,
  children
}: {
  open: boolean
  className?: string
  children: React.ReactNode
}): React.JSX.Element | null {
  const last = useRef(children)
  if (open) {
    last.current = children
  }
  const [mounted, setMounted] = useState(open)
  // Starts closed on a fresh open so the rows transition from 0fr.
  const [expanded, setExpanded] = useState(open)
  useEffect(() => {
    if (open) {
      setMounted(true)
      const frame = requestAnimationFrame(() => setExpanded(true))
      return () => cancelAnimationFrame(frame)
    }
    setExpanded(false)
    const timer = setTimeout(() => setMounted(false), DURATION_MS)
    return () => clearTimeout(timer)
  }, [open])

  if (!open && !mounted) {
    return null
  }
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
        expanded && open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        className
      )}
    >
      <div className="min-h-0 overflow-hidden">{open ? children : last.current}</div>
    </div>
  )
}
