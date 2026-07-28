// Cumulative per-task record of the changes the user has not looked at yet — the model behind the
// sidebar Tasks badge, ported from the reference client's `mergeUnseen` (ChangeDetector.swift).
//
// Fed from the SAME diff the notification poller already runs: one detector run per poll answers
// both surfaces, so a banner and a badge can never disagree about what happened, and no second
// request is made on the user's work server to build a count.
//
// UNREAD ACCRUES WHATEVER THE NOTIFICATION TOGGLES SAY. A toggle governs whether a BANNER fires;
// this is the quieter surface, and a number the user can clear by reading the thing is not an
// interruption. Filtering it by the same switches would make the badge a second notification.
//
// Three rules are the whole reason this is a function rather than a counter:
//   - COMMENTS ACCUMULATE, the other three LATCH. Three polls that each find two new comments owe
//     the user six. But a task cannot be newly assigned twice, and "the due date moved" and
//     "somebody edited it" are states, not tallies — counting those would inflate the badge every
//     poll for a task nobody touched again.
//   - PRUNED AGAINST THE CURRENT LIST on every merge. A completed or reassigned task is gone from
//     the fetch, and a badge counting work that no longer exists cannot be cleared by reading it.
//   - THE SAME REFERENCE COMES BACK when nothing moved, so the caller can skip the disk write and
//     the broadcast on the overwhelmingly common poll that found nothing.

import type { ActiveCollabUnread } from '../../shared/activecollab-api-types'
import type { ActiveCollabTask } from '../../shared/activecollab-types'
import {
  AC_TASK_CHANGE_KINDS,
  type AcTaskChange,
  type AcTaskChangeKind
} from './task-change-detector'

/** Per change kind, how many of that kind are unread. A kind with none is absent, never zero. */
export type AcTaskUnreadCounts = Partial<Record<AcTaskChangeKind, number>>

/** Keyed by task id as a string, because that is what survives a JSON round trip. */
export type AcTaskUnread = Record<string, AcTaskUnreadCounts>

/**
 * One task's counts as a persisted file describes them, or null when the file does not describe
 * them usably at all. Driven off the four known kinds rather than the file's own keys, so a key
 * from a future build costs that entry and nothing else.
 */
export function acReadTaskUnreadCounts(value: unknown): AcTaskUnreadCounts | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const source = value as Record<string, unknown>
  const counts: AcTaskUnreadCounts = {}
  for (const kind of AC_TASK_CHANGE_KINDS) {
    const count = source[kind]
    if (typeof count === 'number' && Number.isInteger(count) && count > 0) {
      counts[kind] = count
    }
  }
  return Object.keys(counts).length === 0 ? null : counts
}

export function acMergeTaskUnread(args: {
  unread: AcTaskUnread
  changes: readonly AcTaskChange[]
  tasks: readonly ActiveCollabTask[]
}): AcTaskUnread {
  const { unread, changes, tasks } = args
  const live = new Set<string>()
  for (const task of tasks) {
    live.add(String(task.id))
  }

  const merged: AcTaskUnread = {}
  let changed = false
  for (const [id, counts] of Object.entries(unread)) {
    if (live.has(id)) {
      merged[id] = counts
      continue
    }
    changed = true
  }

  for (const change of changes) {
    const id = String(change.task.id)
    if (!live.has(id)) {
      // Only reachable if a caller pairs changes with a different list than they came from; the
      // prune above already decided such an id has nothing the user could go and read.
      continue
    }
    const previous = merged[id]
    const counts: AcTaskUnreadCounts = { ...previous }
    if (change.kind === 'comments') {
      counts.comments = (counts.comments ?? 0) + change.newComments
    } else {
      counts[change.kind] = 1
    }
    if (counts[change.kind] !== previous?.[change.kind]) {
      changed = true
    }
    merged[id] = counts
  }

  return changed ? merged : unread
}

/** The user opened this task: every kind on it goes, not only the one that drew them to it. */
export function acForgetTaskUnread(unread: AcTaskUnread, taskId: number): AcTaskUnread {
  const key = String(taskId)
  if (unread[key] === undefined) {
    return unread
  }
  const next = { ...unread }
  delete next[key]
  return next
}

export function acTaskUnreadSummary(unread: AcTaskUnread): ActiveCollabUnread {
  const byTask: Record<string, number> = {}
  let total = 0
  for (const [id, counts] of Object.entries(unread)) {
    let taskTotal = 0
    for (const count of Object.values(counts)) {
      taskTotal += count
    }
    if (taskTotal > 0) {
      byTask[id] = taskTotal
      total += taskTotal
    }
  }
  return { total, byTask }
}
