// Poll-and-diff change detection for ActiveCollab task notifications: the whole feature's logic,
// as one pure function.
//
// ActiveCollab has no incremental API — no webhooks, no ETag, no `?since=` — verified against
// projects.efront.com.au 8.0.31. The only way to know what changed is to compare the current
// assigned-task page against a snapshot of the previous one, so this is a port of the reference
// client's ChangeDetector.swift, rule for rule. `now` is injected and the next snapshot is
// returned rather than written, because every rule below is a trap and each has to be provable
// without a server or a clock:
//
//   - FIRST RUN EMITS NOTHING. `previous === null` seeds the snapshot silently; anything else
//     announces the user's entire existing workload the first time the feature is switched on.
//   - A task absent from the previous snapshot is a new assignment, and its CURRENT due bucket is
//     recorded as already notified, so a task that arrives already overdue fires once, not twice.
//   - A comment-count delta is `comments`, carrying how many arrived.
//   - `updatedOn` moving with NO comment delta is `updated`. Comments bump `updated_on` too, so
//     the generic edit event has to be suppressed when a comment already explains the bump —
//     otherwise every comment on earth fires two notifications.
//   - Due escalation fires once per bucket. A bucket moving BACKWARDS (the date was pushed out)
//     re-arms the recorded bucket so a later re-approach fires again.
//   - Tasks absent from the fetch are dropped, never reported: they were completed or reassigned.
//     Dropping waits out ONE poll of grace first (see `missedPolls`), because pagination shift can
//     hide a task from a single fetch and an immediate drop re-announces it as new.
//
// Two rules live outside this function because neither is a diff. A FAILED fetch must never reach
// it — diffing an empty result reports every task as gone and re-announces them all on recovery
// (see task-notification-poller.ts). And this app's OWN writes are folded into the snapshot at
// write time by `acFoldLocalWrite` below, so the poll that observes the echo has nothing to report.

import type { ActiveCollabTask } from '../../shared/activecollab-types'
import {
  AC_DUE_NOTIFY_FLOOR,
  acDueBucketFor,
  acDueBucketRank,
  type AcDueBucket
} from './task-due-bucket'

export type AcTaskSnapshotEntry = {
  commentCount: number
  /** The nearest bucket already announced. Re-armed DOWNWARD when the due date is pushed out. */
  notifiedDueBucket: AcDueBucket
  /** null means "unknown": the next poll adopts the server's value without reporting an edit. */
  updatedOn: number | null
  /**
   * Set while the task is absent from a fetch it should have been in. Pagination shift can hide
   * a task from one multi-page fetch (pages are read moments apart); dropping it immediately
   * re-announces it as a brand-new assignment when it reappears. Absent twice in a row = gone.
   */
  missedPolls?: number
}

/** Keyed by task id as a string, because that is what survives a JSON round trip. */
export type AcTaskSnapshot = Record<string, AcTaskSnapshotEntry>

/** The canonical order, so the unread model and the notification map cannot drift from the diff. */
export const AC_TASK_CHANGE_KINDS = ['assigned', 'comments', 'due', 'updated'] as const

export type AcTaskChangeKind = (typeof AC_TASK_CHANGE_KINDS)[number]

export type AcTaskChange =
  | { kind: 'assigned'; task: ActiveCollabTask }
  | { kind: 'comments'; task: ActiveCollabTask; newComments: number }
  | { kind: 'due'; task: ActiveCollabTask; bucket: AcDueBucket }
  | { kind: 'updated'; task: ActiveCollabTask }

/** The state a task is in right now, as the snapshot records it. */
export function acTaskSnapshotEntry(task: ActiveCollabTask, now: number): AcTaskSnapshotEntry {
  return {
    commentCount: task.commentCount,
    notifiedDueBucket: acDueBucketFor(task.dueOn, now),
    updatedOn: task.updatedOn
  }
}

export function acDiffTaskSnapshot(args: {
  /** null = first run. Not an empty snapshot: an empty one means "you had no tasks", which differs. */
  previous: AcTaskSnapshot | null
  tasks: readonly ActiveCollabTask[]
  now: number
}): { changes: AcTaskChange[]; snapshot: AcTaskSnapshot } {
  const { previous, tasks, now } = args
  const snapshot: AcTaskSnapshot = {}
  const changes: AcTaskChange[] = []

  for (const task of tasks) {
    const key = String(task.id)
    const state = previous?.[key]

    if (previous === null || state === undefined) {
      // Recording the current bucket as already notified is what keeps an arriving overdue task to
      // one event: the assignment itself already says the word "overdue".
      snapshot[key] = acTaskSnapshotEntry(task, now)
      if (previous !== null) {
        changes.push({ kind: 'assigned', task })
      }
      continue
    }

    const newComments = task.commentCount - state.commentCount
    if (newComments > 0) {
      changes.push({ kind: 'comments', task, newComments })
    } else if (
      task.updatedOn !== null &&
      state.updatedOn !== null &&
      task.updatedOn > state.updatedOn
    ) {
      // No comment to explain the bump, and a known previous value to compare against: a real edit.
      changes.push({ kind: 'updated', task })
    }

    const bucket = acDueBucketFor(task.dueOn, now)
    const rank = acDueBucketRank(bucket)
    const notifiedRank = acDueBucketRank(state.notifiedDueBucket)
    let notifiedDueBucket = state.notifiedDueBucket
    if (rank >= acDueBucketRank(AC_DUE_NOTIFY_FLOOR) && rank > notifiedRank) {
      changes.push({ kind: 'due', task, bucket })
      notifiedDueBucket = bucket
    } else if (rank < notifiedRank) {
      notifiedDueBucket = bucket
    }

    snapshot[key] = {
      commentCount: task.commentCount,
      notifiedDueBucket,
      // A row with no `updated_on` keeps whatever was known; only the server can raise it.
      updatedOn: task.updatedOn ?? state.updatedOn
    }
  }

  // GRACE, ONE POLL WIDE: a known task absent from this fetch is retained once before it is
  // dropped. Pages of a multi-page fetch are read moments apart, so a task that shifts pages
  // mid-read is absent from a fetch that is otherwise complete; dropping it now would announce
  // it as a new assignment on the very next poll. Reappearance rejoins the loop above (which
  // clears the marker by rebuilding the entry); a second consecutive absence is a real removal
  // — completed or reassigned — and stays unreported, as removals always were.
  if (previous !== null) {
    for (const [key, state] of Object.entries(previous)) {
      if (snapshot[key] !== undefined || (state.missedPolls ?? 0) >= 1) {
        continue
      }
      snapshot[key] = { ...state, missedPolls: (state.missedPolls ?? 0) + 1 }
    }
  }

  return { changes, snapshot }
}

/**
 * Fold one of THIS APP's own writes into the snapshot, so the poll that observes the echo reports
 * nothing. Completing, commenting, reassigning and re-dating all come back on the next fetch as
 * somebody's change, and that somebody is the user, who was already looking at it.
 *
 * Precedence: an echoed row is the exact state the next poll will see, so it wins outright.
 * Without one, `postedComments` and `dueOn` patch what this app knows it changed, and `updatedOn`
 * drops to unknown — the server moved it to a value only the server has.
 *
 * A task the snapshot has never seen is only recorded when an echoed row describes it (assigning a
 * task to yourself). Inventing an entry from a bare id would let the next poll read it as new.
 */
export function acFoldLocalWrite(args: {
  snapshot: AcTaskSnapshot
  taskId: number
  /** The row the server echoed back, when it sent a usable one. */
  task?: ActiveCollabTask | null
  /** Comments this app just posted; a posted comment does not carry the task's new count. */
  postedComments?: number
  /** The due date this app just wrote. Read only when there is no echoed row to take it from. */
  dueOn?: number | null
  now: number
}): AcTaskSnapshot {
  const key = String(args.taskId)
  if (args.task) {
    return { ...args.snapshot, [key]: acTaskSnapshotEntry(args.task, args.now) }
  }
  const state = args.snapshot[key]
  if (state === undefined) {
    return args.snapshot
  }
  return {
    ...args.snapshot,
    [key]: {
      commentCount: state.commentCount + (args.postedComments ?? 0),
      notifiedDueBucket:
        args.dueOn === undefined ? state.notifiedDueBucket : acDueBucketFor(args.dueOn, args.now),
      updatedOn: null
    }
  }
}
