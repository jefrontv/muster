import React from 'react'
import { CircleCheck, MessageCircleQuestion } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgentWorkingSpinner } from '@/components/AgentWorkingSpinner'

// Why: shared state-indicator primitive so the dashboard and the sidebar's
// agent hover share a single state vocabulary. Most states render as a dot;
// 'working' renders a spinner. 'done' intentionally diverges from the
// sidebar's StatusIndicator: the dashboard uses a check icon so completion
// is visually distinct from 'idle' (grey dot) and the sidebar's 'active'
// (success dot), while the sidebar collapses 'done'/'active' to the same
// success dot and relies on a tooltip. It sits next to the agent icon
// (Claude/Codex/etc.) — two distinct glyphs: one for *who* (agent icon) and
// one for *what state* (this indicator). Keeping them separate keeps each
// scannable instead of fused into one decorated icon.

export type AgentDotState =
  | 'working'
  | 'blocked'
  | 'waiting'
  | 'interrupted'
  // Why: AI Vault subagent rows report a transcript-derived failure, which is
  // an outcome (like 'done'), not a live attention state like 'blocked'.
  | 'failed'
  | 'done'
  | 'idle'
  // Why: the sidebar's title-based status flow (StatusIndicator/WorktreeCard)
  // collapses blocked + waiting into a single "needs attention" state. Keep
  // this as a distinct member so that flow can render without inventing a new
  // vocabulary, while rendering it with the same amber attention color as the
  // worktree-level permission dot.
  | 'permission'

/** Return the accessible label shared by every visual agent-state marker. */
export function agentStateLabel(state: AgentDotState): string {
  switch (state) {
    case 'working':
      return 'Working'
    case 'blocked':
      return 'Blocked'
    case 'waiting':
      return 'Waiting for input'
    case 'interrupted':
      return 'Interrupted'
    case 'failed':
      return 'Failed'
    case 'done':
      return 'Done'
    case 'idle':
      return 'Idle'
    case 'permission':
      return 'Needs attention'
  }
}

type Props = {
  state: AgentDotState
  size?: 'sm' | 'md'
  className?: string
}

/** Render the compact state glyph used by agent rows and terminal tabs. */
export const AgentStateDot = React.memo(function AgentStateDot({
  state,
  size = 'sm',
  className
}: Props): React.JSX.Element {
  const box = size === 'md' ? 'h-3 w-3' : 'h-2.5 w-2.5'
  // Box and dot in px: 12/8 for md, 10/6 for sm.
  const dotBox = size === 'md' ? 12 : 10
  const dotRadius = size === 'md' ? 4 : 3
  // The arc needs a little more room than a dot to read as a spinner.
  const spinner = size === 'md' ? 'size-2.5' : 'size-2'
  const icon = size === 'md' ? 'size-3' : 'size-2.5'

  if (state === 'working') {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center', box, className)}
        aria-label={agentStateLabel(state)}
      >
        <AgentWorkingSpinner className={spinner} />
      </span>
    )
  }

  if (state === 'done') {
    // Why: the dashboard lists many agents, so a check glyph scans well for
    // agent-reported completion and keeps 'done' visually distinct from
    // 'idle' and other dot states at a glance. The sidebar's StatusIndicator
    // intentionally diverges (success dot + tooltip) — see file header.
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center', box, className)}
        aria-label={agentStateLabel(state)}
      >
        <CircleCheck className={cn('text-status-success', icon)} aria-hidden="true" />
      </span>
    )
  }

  if (state === 'permission' || state === 'waiting') {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center', box, className)}
        aria-label={agentStateLabel(state)}
      >
        <MessageCircleQuestion className={cn('text-status-attention', icon)} aria-hidden="true" />
      </span>
    )
  }

  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', box, className)}
      aria-label={agentStateLabel(state)}
    >
      {/* Why: an SVG circle stays round at fractional zoom; a rounded 6px box snaps to an oval. */}
      <svg viewBox={`0 0 ${dotBox} ${dotBox}`} className={cn('block', box)} aria-hidden="true">
        <circle
          cx={dotBox / 2}
          cy={dotBox / 2}
          r={dotRadius}
          className={
            state === 'blocked' || state === 'interrupted' || state === 'failed'
              ? 'fill-red-500'
              : 'fill-neutral-500/40'
          }
        />
      </svg>
    </span>
  )
})
