// Where the per-credential poll state lives between polls, and between runs: the task snapshot the
// diff compares against, and the unread counts the sidebar badge draws.
//
// KEYED ON THE CREDENTIAL IDENTITY — instance URL plus user id, the same pair name-directory.ts and
// project-members.ts key on, and never a bare global. Reconnecting as somebody else has to read as
// a first run; diffing a new account's tasks against the previous account's snapshot would
// announce one colleague's entire workload to another. A key that does not match is therefore
// indistinguishable from no file at all.
//
// Persisted because the first-run rule is only half a rule if a restart re-arms it: an app that
// re-announces every assigned task on launch is worse than one that never notifies at all.
//
// A plain JSON file rather than the settings store: this is a per-account cache of ids, counts and
// buckets that nothing else reads, and it is rewritten on every poll.
//
// The unread counts and the mention seen-marker share that one file, and therefore that one key, so
// a reconnect as another account cannot inherit a badge or a mention history any more than it can
// inherit a snapshot. Each field has its own writer — every writer carries the other two forward —
// because a save that took only its own field would silently truncate the ones its caller forgot.

import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { ActiveCollabTask } from '../../shared/activecollab-types'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import { getCanonicalUserDataPath } from '../persistence'
import { getActiveCollabCredential } from './credential-store'
import {
  acFoldLocalWrite,
  type AcTaskSnapshot,
  type AcTaskSnapshotEntry
} from './task-change-detector'
import type { AcMentionSeen } from './mention-detector'
import { acIsDueBucket } from './task-due-bucket'
import { acReadTaskUnreadCounts, type AcTaskUnread } from './task-unread'

const FILE_NAME = 'activecollab-task-snapshot.json'

/**
 * The identity this snapshot belongs to, or null when nothing usable is connected. The token is
 * deliberately absent: a reissued token for the same person on the same instance addresses the very
 * same workload, and a secret has no business in a filename or a cache key.
 */
export function acCurrentTaskSnapshotKey(): string | null {
  try {
    const credential = getActiveCollabCredential()
    return credential === null ? null : `${credential.instanceUrl}#${credential.userId}`
  } catch {
    // A keychain refusal reads the same as "not connected": no key, so no polling and no diffing.
    return null
  }
}

function acSnapshotPath(): string {
  return path.join(getCanonicalUserDataPath(), FILE_NAME)
}

function acReadEntry(value: unknown): AcTaskSnapshotEntry | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const entry = value as Record<string, unknown>
  const commentCount = entry.commentCount
  const updatedOn = entry.updatedOn
  if (typeof commentCount !== 'number' || !acIsDueBucket(entry.notifiedDueBucket)) {
    return null
  }
  return {
    commentCount,
    notifiedDueBucket: entry.notifiedDueBucket,
    updatedOn: typeof updatedOn === 'number' ? updatedOn : null
  }
}

/** The file's own fields, or null when it is absent, unreadable, or another account's. */
function acReadSnapshotFile(
  key: string
): { tasks?: unknown; unread?: unknown; mentions?: unknown } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(acSnapshotPath(), 'utf8'))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }
  const file = parsed as { key?: unknown; tasks?: unknown; unread?: unknown; mentions?: unknown }
  return file.key === key ? file : null
}

/**
 * The snapshot saved for `key`, or null when there is none — which the detector treats as a first
 * run and therefore reports nothing. A file written by another account, a truncated file and an
 * absent file are all the same answer: null, stay quiet, seed a fresh one.
 */
export function acLoadTaskSnapshot(key: string): AcTaskSnapshot | null {
  const file = acReadSnapshotFile(key)
  if (file === null || typeof file.tasks !== 'object' || file.tasks === null) {
    return null
  }
  const snapshot: AcTaskSnapshot = {}
  for (const [id, value] of Object.entries(file.tasks as Record<string, unknown>)) {
    const entry = acReadEntry(value)
    if (entry !== null) {
      snapshot[id] = entry
    }
  }
  return snapshot
}

/**
 * The unread counts saved for `key`, or empty. Empty for another account's file too: a badge is a
 * claim about the reader's own workload.
 */
export function acLoadTaskUnread(key: string): AcTaskUnread {
  const file = acReadSnapshotFile(key)
  if (file === null || typeof file.unread !== 'object' || file.unread === null) {
    return {}
  }
  const unread: AcTaskUnread = {}
  for (const [id, value] of Object.entries(file.unread as Record<string, unknown>)) {
    const counts = acReadTaskUnreadCounts(value)
    if (counts !== null) {
      unread[id] = counts
    }
  }
  return unread
}

/**
 * The mention seen-marker for `key`, or null when there is none — which the mention detector
 * treats as a first run and therefore announces nothing. Same posture as the task snapshot: a
 * foreign, truncated or absent file all read as null.
 */
export function acLoadMentionSeen(key: string): AcMentionSeen | null {
  const file = acReadSnapshotFile(key)
  if (file === null || typeof file.mentions !== 'object' || file.mentions === null) {
    return null
  }
  const seen: AcMentionSeen = {}
  for (const [id, value] of Object.entries(file.mentions as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      seen[id] = value
    }
  }
  return seen
}

/**
 * Never throws: a file that could not be written costs one silent poll, not a crash.
 *
 * `tasks` is omitted rather than written empty when there is no snapshot — writing `tasks: {}`
 * would turn the next poll's silent first run into "you had no tasks", which announces the user's
 * entire workload.
 */
function acWriteSnapshotFile(
  key: string,
  tasks: AcTaskSnapshot | null,
  unread: AcTaskUnread,
  mentions: AcMentionSeen | null
): void {
  try {
    writeFileAtomically(
      acSnapshotPath(),
      JSON.stringify({
        key,
        ...(tasks === null ? {} : { tasks }),
        unread,
        ...(mentions === null ? {} : { mentions })
      })
    )
  } catch {
    // Nothing actionable — the next poll rewrites it, or reads null and seeds again silently.
  }
}

export function acSaveTaskSnapshot(key: string, snapshot: AcTaskSnapshot): void {
  acWriteSnapshotFile(key, snapshot, acLoadTaskUnread(key), acLoadMentionSeen(key))
}

/**
 * A no-op while no snapshot exists for `key`, and NOT merely because there would be nothing to
 * count: writing `tasks: {}` here would turn the next poll's silent first run into "you had no
 * tasks", which announces the user's entire workload.
 */
export function acSaveTaskUnread(key: string, unread: AcTaskUnread): void {
  const snapshot = acLoadTaskSnapshot(key)
  if (snapshot !== null) {
    acWriteSnapshotFile(key, snapshot, unread, acLoadMentionSeen(key))
  }
}

/**
 * Unlike the counts, this does NOT require an existing snapshot: mentions come from the
 * notifications stream, not the task diff, so their history has to survive a first poll that has
 * no snapshot yet. The snapshot key is simply omitted when absent, which keeps the task diff's
 * first-run rule intact.
 */
export function acSaveMentionSeen(key: string, mentions: AcMentionSeen): void {
  acWriteSnapshotFile(key, acLoadTaskSnapshot(key), acLoadTaskUnread(key), mentions)
}

/** Called on disconnect: the tasks of a credential the user just removed are not ours to keep. */
export function acClearTaskSnapshot(): void {
  rmSync(acSnapshotPath(), { force: true })
}

/**
 * Fold this app's own write into the PERSISTED snapshot. Every poll re-reads the file, so a fold
 * landing here is what the next diff compares against.
 *
 * A no-op while no snapshot exists for the connected credential: an absent snapshot means the first
 * poll has not run yet, and writing one now would turn that poll's silent seeding into an
 * announcement of every OTHER task the user has.
 */
export function acFoldLocalTaskWrite(args: {
  taskId: number
  task?: ActiveCollabTask | null
  postedComments?: number
  dueOn?: number | null
  now?: number
}): void {
  const key = acCurrentTaskSnapshotKey()
  if (key === null) {
    return
  }
  const snapshot = acLoadTaskSnapshot(key)
  if (snapshot === null) {
    return
  }
  acSaveTaskSnapshot(
    key,
    acFoldLocalWrite({
      snapshot,
      taskId: args.taskId,
      task: args.task,
      postedComments: args.postedComments,
      dueOn: args.dueOn,
      now: args.now ?? Date.now()
    })
  )
}
