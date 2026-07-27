// The due-date urgency ladder the task notifier escalates through.
//
// Ported from the reference client's DueBucket.swift, and ORDERED for the same reason: "this task
// got more urgent" is `next > previous` and "the due date was pushed out" is `next < previous`, so
// escalation and re-arming are comparisons instead of a special case each.
//
// Anchored on the LOCAL calendar day. `ActiveCollabTask.dueOn` arrives already re-anchored by
// `acEpochToLocalDay`, so nothing here re-projects it through UTC — doing that a second time is
// exactly what makes a due date read a day early west of the meridian.

/** Floor to ceiling. The index IS the rank, which is what makes the comparisons above legal. */
export const AC_DUE_BUCKETS = [
  'none',
  'later',
  'this-week',
  'tomorrow',
  'today',
  'overdue'
] as const

export type AcDueBucket = (typeof AC_DUE_BUCKETS)[number]

/**
 * Below this a due date is real but not news. A task due in six days will be due tomorrow soon
 * enough, and announcing `later` the moment a date is entered makes date entry itself a
 * notification.
 */
export const AC_DUE_NOTIFY_FLOOR: AcDueBucket = 'tomorrow'

export function acDueBucketRank(bucket: AcDueBucket): number {
  return AC_DUE_BUCKETS.indexOf(bucket)
}

/** Guards a bucket read back out of a persisted snapshot, where the file could say anything. */
export function acIsDueBucket(value: unknown): value is AcDueBucket {
  return typeof value === 'string' && (AC_DUE_BUCKETS as readonly string[]).includes(value)
}

/**
 * The LOCAL calendar day as a day number. `Date.UTC` over the local y/m/d, so the difference
 * between two days is exact across a DST boundary — dividing an epoch-ms difference by 86_400_000
 * is an hour out twice a year, which is enough to call "due today" overdue.
 */
function acLocalDayNumber(epochMs: number): number {
  const local = new Date(epochMs)
  return Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) / 86_400_000
}

export function acDueBucketFor(dueOn: number | null, now: number): AcDueBucket {
  if (dueOn === null || !Number.isFinite(dueOn)) {
    return 'none'
  }
  const days = acLocalDayNumber(dueOn) - acLocalDayNumber(now)
  if (days < 0) {
    return 'overdue'
  }
  if (days === 0) {
    return 'today'
  }
  if (days === 1) {
    return 'tomorrow'
  }
  return days <= 7 ? 'this-week' : 'later'
}

/** Notification copy. Present tense: the banner is read the moment it fires. */
export function acDueBucketPhrase(bucket: AcDueBucket): string {
  switch (bucket) {
    case 'overdue':
      return 'Overdue'
    case 'today':
      return 'Due today'
    case 'tomorrow':
      return 'Due tomorrow'
    case 'this-week':
      return 'Due this week'
    case 'later':
      return 'Due later'
    case 'none':
      return 'No due date'
  }
}
