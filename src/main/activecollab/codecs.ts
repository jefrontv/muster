import type { ActiveCollabLabel } from '../../shared/activecollab-types'

// Every ActiveCollab wire quirk is absorbed here so nothing above this file has
// to know that `0` means "unset", that dates are UTC midnight on read and
// "YYYY-MM-DD" on write, or that labels have two different shapes.

/**
 * Narrow unknown JSON to a record so field reads need no cast. Arrays are
 * excluded — every payload we pull named fields off is an object.
 */
export function acIsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Re-anchor an ActiveCollab date-only field to the local calendar, returning
 * epoch ms.
 *
 * ActiveCollab serialises `due_on` as UTC midnight. Reading that with local
 * getters lands on the PREVIOUS calendar day for anyone WEST of UTC —
 * 2026-07-27T00:00:00Z is 2026-07-26 17:00 in Los Angeles — so a due date
 * silently shifts a day. Read y/m/d in UTC, then rebuild that same calendar day
 * at LOCAL midnight.
 *
 * `0` is the API's "unset", so it maps to null alongside null/undefined and any
 * non-finite value.
 */
export function acEpochToLocalDay(epochSeconds: number | null | undefined): number | null {
  if (typeof epochSeconds !== 'number' || !Number.isFinite(epochSeconds) || epochSeconds === 0) {
    return null
  }
  const utc = new Date(epochSeconds * 1000)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()).getTime()
}

/**
 * Inverse of {@link acEpochToLocalDay}. Writes go out as "YYYY-MM-DD" taken
 * from the LOCAL calendar day, so the day the user picked is the day the server
 * stores.
 *
 * null passes straight through, because upstream an explicit null CLEARS the
 * field while omitting the key leaves it untouched.
 */
export function acDateForWrite(epochMs: number | null): string | null {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs)) {
    return null
  }
  const local = new Date(epochMs)
  const year = String(local.getFullYear()).padStart(4, '0')
  const month = String(local.getMonth() + 1).padStart(2, '0')
  const day = String(local.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * `0` is ActiveCollab's null sentinel for `assignee_id`, `task_list_id`,
 * `job_type_id` and `label_id` — it is not "user 0". Anything that is not a
 * positive integer is absent.
 */
export function acNullableId(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/**
 * Labels arrive as objects on most endpoints and as bare name strings on
 * others, and their `position` is a string when nested but an int standalone —
 * so nothing may assume a uniform field shape. Entries with no usable name are
 * dropped rather than rendered as an empty chip.
 */
export function acLabels(value: unknown): ActiveCollabLabel[] {
  if (!Array.isArray(value)) {
    return []
  }
  const labels: ActiveCollabLabel[] = []
  for (const entry of value) {
    const label = acLabel(entry)
    if (label !== null) {
      labels.push(label)
    }
  }
  return labels
}

function acLabel(entry: unknown): ActiveCollabLabel | null {
  if (typeof entry === 'string') {
    const name = entry.trim()
    // A bare-string label carries no id, and 0 is the API's own "no id" value.
    return name === '' ? null : { id: 0, name, color: null }
  }
  if (!acIsRecord(entry)) {
    return null
  }
  const name = typeof entry.name === 'string' ? entry.name.trim() : ''
  if (name === '') {
    return null
  }
  const color = typeof entry.color === 'string' ? entry.color.trim() : ''
  return { id: acNullableId(entry.id) ?? 0, name, color: color === '' ? null : color }
}

/** Writes replace the whole label set and take bare names, never objects. */
export function acLabelNames(labels: ActiveCollabLabel[]): string[] {
  return labels.map((label) => label.name)
}
