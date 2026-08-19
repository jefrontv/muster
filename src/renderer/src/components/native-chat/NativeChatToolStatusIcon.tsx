// The leading glyph on a tool row, which doubles as the call's progress state:
// a spinner while the call is out, a tick the moment its result lands, then back
// to the wrench. The tick is held briefly rather than swapped instantly —
// without the hold, a fast tool completes between frames and the user never sees
// that anything happened.

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Long enough to register as "that finished", short enough not to linger. */
export const TOOL_TICK_HOLD_MS = 1_400

export type ToolCallStatus = 'running' | 'settled'

/**
 * Tracks the running → settled edge so the tick shows only on a transition the
 * user could have watched. A row that mounts already settled (scrollback, a
 * reloaded transcript) shows the wrench, never a tick for work done long ago.
 */
export function useToolCompletionFlash(status: ToolCallStatus): boolean {
  const [flashing, setFlashing] = useState(false)
  const previous = useRef(status)

  useEffect(() => {
    const justSettled = previous.current === 'running' && status === 'settled'
    previous.current = status
    if (!justSettled) {
      return undefined
    }
    setFlashing(true)
    const timer = window.setTimeout(() => setFlashing(false), TOOL_TICK_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  return flashing
}

export function NativeChatToolStatusIcon({
  status,
  className
}: {
  status: ToolCallStatus
  className?: string
}): React.JSX.Element {
  const flashing = useToolCompletionFlash(status)
  const shared = cn('size-3 shrink-0', className)

  if (status === 'running') {
    return (
      <Loader2
        aria-label="Running"
        className={cn(shared, 'text-foreground/70 motion-safe:animate-spin')}
      />
    )
  }
  if (flashing) {
    return (
      <Check
        aria-label="Finished"
        className={cn(
          shared,
          'text-emerald-600 dark:text-emerald-400',
          'motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50'
        )}
      />
    )
  }
  return (
    <Wrench
      className={cn(shared, 'text-muted-foreground', 'motion-safe:animate-in motion-safe:fade-in')}
    />
  )
}
