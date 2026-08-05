// ActiveCollab's date-only wire format, shared: main decodes/encodes tasks with it, and the
// renderer's schedule picker pins its round-trip tests against the SAME functions rather than a
// reimplementation that could drift by a timezone.

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
