// Display stamps for the provider's plain epoch-ms fields — a task's `createdOn`/`updatedOn` and a
// comment's `createdOn`.
//
// `dueOn` is NOT one of these: it is re-anchored to a local calendar day upstream and has its own
// module (`activecollab-task-due-date.ts`). Do not format it here.

export type ActiveCollabStamp = {
  /** Machine-readable, for `<time dateTime>`. */
  iso: string
  label: string
}

/**
 * `date` where a time of day would be noise; `date-time` where ordering within a day matters;
 * `relative` for a feed of recent activity, where "29 minutes ago" places an event faster than a
 * clock time does.
 */
export type ActiveCollabStampStyle = 'date' | 'date-time' | 'relative'

const STAMP_OPTIONS: Record<'date' | 'date-time', Intl.DateTimeFormatOptions> = {
  date: { year: 'numeric', month: 'short', day: 'numeric' },
  'date-time': { dateStyle: 'medium', timeStyle: 'short' }
}

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** Past a day, "20 days ago" is harder to place than the date itself, so `relative` hands over. */
const RELATIVE_LIMIT_MS = 24 * 60 * 60 * 1000

function relativeLabel(epochMs: number): string | null {
  const delta = epochMs - Date.now()
  if (Math.abs(delta) >= RELATIVE_LIMIT_MS) {
    return null
  }
  const minutes = Math.round(delta / 60_000)
  return Math.abs(minutes) < 60
    ? RELATIVE_FORMATTER.format(minutes, 'minute')
    : RELATIVE_FORMATTER.format(Math.round(minutes / 60), 'hour')
}

export function activeCollabStamp(
  epochMs: number | null,
  style: ActiveCollabStampStyle
): ActiveCollabStamp | null {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs)) {
    return null
  }
  const at = new Date(epochMs)
  if (Number.isNaN(at.getTime())) {
    return null
  }
  const options = STAMP_OPTIONS[style === 'date' ? 'date' : 'date-time']
  const absolute = at.toLocaleString(undefined, options)
  return {
    iso: at.toISOString(),
    label: style === 'relative' ? (relativeLabel(at.getTime()) ?? absolute) : absolute
  }
}
