// Due-date display and entry for ActiveCollab tasks.
//
// `ActiveCollabTask.dueOn` is epoch ms ALREADY re-anchored to the local calendar day by the main
// codec (`acEpochToLocalDay`). Re-projecting it through UTC here would shift it back a day, so
// everything below reads and writes with local getters only. Writes travel as epoch ms and the
// shipped codec (`acDateForWrite`) turns them into the "YYYY-MM-DD" the API stores.

export type ActiveCollabDueDate = {
  /** Local calendar day, `YYYY-MM-DD` — the value an `<input type="date">` expects. */
  iso: string
  /** Same day rendered for humans in the active locale. */
  label: string
}

export function formatActiveCollabDueDate(dueOn: number | null): ActiveCollabDueDate | null {
  if (typeof dueOn !== 'number' || !Number.isFinite(dueOn)) {
    return null
  }
  const local = new Date(dueOn)
  if (Number.isNaN(local.getTime())) {
    return null
  }
  const year = String(local.getFullYear()).padStart(4, '0')
  const month = String(local.getMonth() + 1).padStart(2, '0')
  const day = String(local.getDate()).padStart(2, '0')
  return {
    iso: `${year}-${month}-${day}`,
    label: local.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Inverse of {@link formatActiveCollabDueDate}: local midnight for the picked day.
 *
 * Null means CLEAR — callers must still pass `dueOn: null` explicitly, because omitting the key
 * leaves the server's value alone.
 */
export function activeCollabDueDateFromInput(value: string): number | null {
  const parts = ISO_DAY.exec(value.trim())
  if (!parts) {
    return null
  }
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  const local = new Date(year, month - 1, day)
  // Reject overflow like 2026-02-31, which the Date constructor silently rolls forward.
  if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day) {
    return null
  }
  return local.getTime()
}
