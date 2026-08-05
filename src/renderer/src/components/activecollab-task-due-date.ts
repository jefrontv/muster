// Due-date display for ActiveCollab tasks. Entry moved to the range picker in
// activecollab-task-schedule.ts; this module keeps the single-day formatter the task list and the
// schedule label share.
//
// `ActiveCollabTask.dueOn` is epoch ms ALREADY re-anchored to the local calendar day by the main
// codec (`acEpochToLocalDay`). Re-projecting it through UTC here would shift it back a day, so
// everything below reads with local getters only.

export type ActiveCollabDueDate = {
  /** Local calendar day, `YYYY-MM-DD`. */
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
