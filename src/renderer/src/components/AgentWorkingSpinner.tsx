import React from 'react'
import { cn } from '@/lib/utils'
import { agentSpinnerRef } from '@/lib/agent-spinner-clock'

// Why: the working-state ring must not carry its own infinite CSS animation —
// that keeps the compositor awake per element for the whole agent run. The
// shared agent-spinner clock rotates every mounted ring in phase and stops
// cleanly when nothing can be seen. Callers size it via className (size-2 etc.).
export function AgentWorkingSpinner({ className }: { className?: string }): React.JSX.Element {
  return (
    <span
      ref={agentSpinnerRef}
      data-agent-spinner=""
      className={cn('agent-working-spinner block text-yellow-600 dark:text-yellow-400', className)}
    >
      {/* A faint full track under a rounded quarter arc. Under reduced motion the clock never
          ticks, so the track fills in: a frozen arc reads as broken, a full ring as a marker (#9515). */}
      <svg viewBox="0 0 16 16" fill="none" className="block size-full" aria-hidden="true">
        <circle
          cx="8"
          cy="8"
          r="6"
          stroke="currentColor"
          strokeWidth="2.5"
          className="opacity-25 motion-reduce:opacity-100"
        />
        <path
          d="M8 2a6 6 0 0 1 6 6"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
