// Where the task snapshot lives between polls, and between runs.
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
import { acIsDueBucket } from './task-due-bucket'

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

/**
 * The snapshot saved for `key`, or null when there is none — which the detector treats as a first
 * run and therefore reports nothing. A file written by another account, a truncated file and an
 * absent file are all the same answer: null, stay quiet, seed a fresh one.
 */
export function acLoadTaskSnapshot(key: string): AcTaskSnapshot | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(acSnapshotPath(), 'utf8'))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }
  const file = parsed as { key?: unknown; tasks?: unknown }
  if (file.key !== key || typeof file.tasks !== 'object' || file.tasks === null) {
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

/** Never throws: a snapshot that could not be written costs one silent poll, not a crash. */
export function acSaveTaskSnapshot(key: string, snapshot: AcTaskSnapshot): void {
  try {
    writeFileAtomically(acSnapshotPath(), JSON.stringify({ key, tasks: snapshot }))
  } catch {
    // Nothing actionable — the next poll rewrites it, or reads null and seeds again silently.
  }
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
