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

/** `date` where a time of day would be noise; `date-time` where ordering within a day matters. */
export type ActiveCollabStampStyle = 'date' | 'date-time'

const STAMP_OPTIONS: Record<ActiveCollabStampStyle, Intl.DateTimeFormatOptions> = {
  date: { year: 'numeric', month: 'short', day: 'numeric' },
  'date-time': { dateStyle: 'medium', timeStyle: 'short' }
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
  return { iso: at.toISOString(), label: at.toLocaleString(undefined, STAMP_OPTIONS[style]) }
}
