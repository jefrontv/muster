// Presentation maths for the run-history browser, kept out of the components so it is testable
// without a DOM. Nothing here builds a user-visible string: durations come back as numbers and the
// component renders them through translate(), so a locale can order the units however it likes.

import type { SiteRun, SiteRunStatus } from '../../../../shared/site-run-types'

export type RunDuration = {
  hours: number
  minutes: number
  seconds: number
}

/** Null while the run is still going — there is no duration to show yet, only elapsed time. */
export function runDuration(run: Pick<SiteRun, 'startedAt' | 'endedAt'>): RunDuration | null {
  if (run.endedAt === null) {
    return null
  }
  const total = Math.max(0, Math.round((run.endedAt - run.startedAt) / 1000))
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60
  }
}

/** Tailwind text colour per terminal state. A Record, so a new status cannot be silently missed. */
export const RUN_STATUS_TONE: Record<SiteRunStatus, string> = {
  running: 'text-foreground',
  succeeded: 'text-muted-foreground',
  failed: 'text-destructive',
  cancelled: 'text-muted-foreground',
  blocked: 'text-destructive'
}

export const RUN_STATUS_BADGE: Record<SiteRunStatus, 'default' | 'secondary' | 'destructive'> = {
  running: 'default',
  succeeded: 'secondary',
  failed: 'destructive',
  cancelled: 'secondary',
  blocked: 'destructive'
}
