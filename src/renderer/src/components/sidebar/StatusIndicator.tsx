import React from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgentWorkingSpinner } from '@/components/AgentWorkingSpinner'
import { getWorktreeStatusLabel, type WorktreeStatus } from '@/lib/worktree-status'

// Why: re-export WorktreeStatus under the existing `Status` alias so the
// sidebar component and the canonical lib share one source of truth — the
// previous local union could silently drift if one side added a new state
// (e.g., 'error') and the other didn't.
export type Status = WorktreeStatus

type StatusIndicatorProps = React.ComponentProps<'span'> & {
  status: Status
  /** Idle draws nothing; the new sidebar rows show state only when there is one. */
  hideInactive?: boolean
  /** Breathe until seen: finished or waiting on the user. */
  pulse?: boolean
}

const StatusIndicator = React.memo(function StatusIndicator({
  status,
  className,
  title,
  hideInactive = false,
  pulse = false,
  ...rest
}: StatusIndicatorProps) {
  // Why: surface the status label as a native tooltip so hovering the dot
  // reveals the state — matters especially for 'active' vs 'done', which
  // share the same emerald dot. Callers pass aria-hidden="true" alongside
  // an sr-only label, so the `title` attribute is ignored by AT and only
  // serves sighted users on hover. Callers can override by passing their
  // own `title`.
  const resolvedTitle = title ?? getWorktreeStatusLabel(status)

  if (status === 'working') {
    return (
      <span
        className={cn('inline-flex h-3 w-3 shrink-0 items-center justify-center', className)}
        title={resolvedTitle}
        {...rest}
      >
        <AgentWorkingSpinner className="size-2.5" />
      </span>
    )
  }

  if (status === 'permission') {
    return (
      <span
        className={cn(
          'inline-flex h-3 w-3 shrink-0 items-center justify-center',
          pulse && 'sidebar-attention-pulse relative',
          className
        )}
        title={resolvedTitle}
        {...rest}
      >
        {pulse ? (
          <svg
            viewBox="0 0 12 12"
            aria-hidden="true"
            className="absolute inset-0 size-3 overflow-visible fill-status-attention"
          >
            <circle cx="6" cy="6" r="5" className="sidebar-attention-halo" />
          </svg>
        ) : null}
        <MessageCircleQuestion
          className="relative size-3 text-status-attention"
          aria-hidden="true"
        />
      </span>
    )
  }

  if (hideInactive && status === 'inactive') {
    return <span className={cn('inline-flex h-3 w-3 shrink-0', className)} {...rest} />
  }

  const success = status === 'done' || status === 'active'
  return (
    <span
      className={cn('inline-flex h-3 w-3 shrink-0 items-center justify-center', className)}
      title={resolvedTitle}
      {...rest}
    >
      {/* SVG, not a rounded box: at fractional display scales an 8px box lands on part-pixels and
          rounds into a lopsided dot, and a halo scaled from it drifts off centre. */}
      <svg
        viewBox="0 0 12 12"
        aria-hidden="true"
        className={cn(
          'block size-3 overflow-visible',
          pulse && 'sidebar-attention-pulse',
          // Green for both hook-reported 'done' and the heuristic 'active' (terminal open,
          // quiet). Working uses the spinner above; 'inactive' stays grey.
          success ? 'fill-status-success' : 'fill-neutral-500/40'
        )}
      >
        {pulse ? <circle cx="6" cy="6" r="4" className="sidebar-attention-halo" /> : null}
        <circle cx="6" cy="6" r="4" />
      </svg>
    </span>
  )
})

export default StatusIndicator
