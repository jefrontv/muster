import React from 'react'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { useNow } from '@/components/dashboard/useNow'
import { cn } from '@/lib/utils'
import { formatShortTimeAgo, getCompactAgentTimestamp } from './worktree-card-compact-agent-row'

export function getLatestAgentActivityAt(agents: readonly DashboardAgentRowData[]): number | null {
  let latest: number | null = null
  for (const agent of agents) {
    const timestamp = getCompactAgentTimestamp(agent)
    if (timestamp !== null && (latest === null || timestamp > latest)) {
      latest = timestamp
    }
  }
  return latest
}

function ActivityTime({ timestamp }: { timestamp: number }): React.JSX.Element {
  // Why: mounted only for rows with agent activity, so quiet rows pay no clock subscription.
  const now = useNow(30_000)
  return <>{formatShortTimeAgo(timestamp, now)}</>
}

type WorktreeCardTimeSlotProps = {
  timestamp: number | null
  deleteAction: React.ReactNode
}

/** Line-1 trailing slot: relative time at rest, the delete quick action on row hover or focus. */
export function WorktreeCardTimeSlot({
  timestamp,
  deleteAction
}: WorktreeCardTimeSlotProps): React.JSX.Element | null {
  if (timestamp === null && !deleteAction) {
    return null
  }
  const hasAction = Boolean(deleteAction)
  return (
    // Why: a fixed 24px slot so swapping the time for the action never shifts the title.
    <span
      className="worktree-card-time-slot relative flex h-5 w-6 shrink-0 items-center justify-end"
      data-worktree-card-time-slot=""
      data-has-action={hasAction ? 'true' : undefined}
    >
      {timestamp !== null ? (
        <span
          className={cn(
            'worktree-card-time text-[11px] leading-none tabular-nums text-worktree-sidebar-muted-foreground',
            hasAction &&
              'group-hover/worktree-card:opacity-0 group-focus-within/worktree-card:opacity-0'
          )}
          data-worktree-card-time=""
        >
          <ActivityTime timestamp={timestamp} />
        </span>
      ) : null}
      {hasAction ? (
        <span className="worktree-card-time-slot-action absolute inset-0 flex items-center justify-end">
          {deleteAction}
        </span>
      ) : null}
    </span>
  )
}
