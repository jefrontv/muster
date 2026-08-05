// Start/due range scheduling for ActiveCollab tasks: draft selection and row display.
//
// Every epoch here is a LOCAL-midnight calendar day (see activecollab-task-due-date.ts): the main
// codec re-anchors `start_on`/`due_on` before the renderer sees them, and writes travel as epoch
// ms for the local day the user picked. Nothing here may round-trip through UTC.

import { formatActiveCollabDueDate } from './activecollab-task-due-date'

/** What Save commits. Both keys always travel — an omitted key would leave the server alone. */
export type ActiveCollabSchedule = {
  startOn: number | null
  dueOn: number | null
}

/** The in-popover selection: `start` lands on the first click, `end` on the second. */
export type ActiveCollabScheduleDraft = {
  start: number | null
  end: number | null
}

/**
 * Seed the picker from the task's stored dates. A due-only task (every task written before ranges
 * existed) opens with the due day as a single selected day, so Save without edits keeps that day.
 */
export function activeCollabScheduleDraft(
  startOn: number | null,
  dueOn: number | null
): ActiveCollabScheduleDraft {
  if (startOn !== null) {
    return { start: startOn, end: dueOn ?? startOn }
  }
  return dueOn !== null ? { start: dueOn, end: dueOn } : { start: null, end: null }
}

/**
 * One grid click. The first click begins a range; the second completes it, swapping when it lands
 * on an earlier day; a click on a completed range starts a fresh one. The same day twice is a
 * legitimate single-day range.
 */
export function activeCollabPickScheduleDay(
  draft: ActiveCollabScheduleDraft,
  day: number
): ActiveCollabScheduleDraft {
  if (draft.start === null || draft.end !== null) {
    return { start: day, end: null }
  }
  if (day < draft.start) {
    return { start: day, end: draft.start }
  }
  return { start: draft.start, end: day }
}

/** What Save commits, or null when nothing is selected. One click then Save = single-day range. */
export function activeCollabScheduleFromDraft(
  draft: ActiveCollabScheduleDraft
): ActiveCollabSchedule | null {
  if (draft.start === null) {
    return null
  }
  return { startOn: draft.start, dueOn: draft.end ?? draft.start }
}

/** `d MMM`, day-first whatever the locale, matching ActiveCollab's own range rendering. */
function dayMonth(epochMs: number): string {
  const local = new Date(epochMs)
  return `${local.getDate()} ${local.toLocaleDateString(undefined, { month: 'short' })}`
}

/**
 * The DUE DATE row's text: null when nothing is set, the plain due-date label when the task holds
 * a single day, `d MMM – d MMM` once a range is stored. A lone start date (the server can hold
 * one, though this picker always writes both) renders as a single day the same way.
 */
export function formatActiveCollabScheduleLabel(
  startOn: number | null,
  dueOn: number | null
): string | null {
  if (startOn !== null && dueOn !== null && startOn !== dueOn) {
    return `${dayMonth(startOn)} – ${dayMonth(dueOn)}`
  }
  return formatActiveCollabDueDate(dueOn ?? startOn)?.label ?? null
}
