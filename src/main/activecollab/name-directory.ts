// The id-to-name join that makes a task row renderable.
//
// ActiveCollab 8.0.31 sends NEITHER `project_name` NOR `assignee_name` on a task row — verified
// against projects.efront.com.au, where 0 of 11 assigned rows carried either field and
// `projects/5937/tasks/508401` reports `assignee_id: 407` with no name anywhere on the payload.
// Reading those fields therefore yields an empty project heading and a detail pane that claims
// "Unassigned" about a task that is assigned. Both names have to be joined from a collection.
//
// The join is bounded to AT MOST ONE round trip per collection per cache window, however many
// rows are on screen and however many callers ask at once, because the alternative — a lookup per
// row — costs a request per line of a 100-row page.
//
// The cache is keyed on the CREDENTIAL IDENTITY, never on the token and never as a bare global:
// the ipc layer builds a fresh client per call precisely so a reconnect can swap credentials
// mid-flight, and a shared map would happily serve one account's project names to the next.

import type {
  ActiveCollabSubtask,
  ActiveCollabTask,
  ActiveCollabUser
} from '../../shared/activecollab-types'
import type { AcHttpClient } from './http'
import { listProjects } from './tasks'
import { listUsers } from './users'

/**
 * Five minutes, matching the reference client's `name_cache_ttl` default.
 *
 * Projects and users are org-scale directories that change on a human timescale — a project is
 * renamed or a colleague onboarded maybe weekly — while the task list refetches on every poll and
 * every navigation. Five minutes therefore bounds the staleness of a DISPLAY LABEL to something
 * nobody notices, while capping the cost at two extra requests per window no matter how many rows
 * or concurrent readers there are. A newly created project still resolves within one refresh cycle
 * of a coffee break.
 *
 * Exported because project-members.ts caches on the same terms: one directory policy, not two.
 */
export const AC_DIRECTORY_TTL_MS = 5 * 60_000

/**
 * A window that FAILED expires far sooner: a transient 500 or a dropped connection must not blank
 * every name for five minutes, but retrying per call would turn one bad window into a request per
 * row. Thirty seconds lets the next poll recover.
 */
export const AC_DIRECTORY_RETRY_TTL_MS = 30_000

const AC_NO_NAMES: ReadonlyMap<number, string> = new Map()
const AC_NO_USERS: ReadonlyMap<number, ActiveCollabUser> = new Map()

export type AcNameDirectory = {
  readonly projects: ReadonlyMap<number, string>
  /** Full roster rows, so consumers can render names AND avatars from the one cached read. */
  readonly users: ReadonlyMap<number, ActiveCollabUser>
}

/** Resolves the directory for one credential. NEVER rejects — see {@link acNameMap}. */
export type AcNameDirectoryLoader = () => Promise<AcNameDirectory>

type AcNameCacheEntry = {
  expiresAt: number
  directory: Promise<AcNameDirectory>
}

/**
 * Keyed by `instanceUrl` + `userId`, the two fields that identify WHOSE names these are. The token
 * is deliberately not part of the key: it is a secret that would then live in a map key and in
 * every debug dump of it, and it buys nothing — a reissued token for the same person on the same
 * instance addresses the very same directory.
 *
 * Unbounded in principle, bounded in practice: one entry per credential a process has used, and
 * connect/disconnect clear it outright.
 */
const acNameCache = new Map<string, AcNameCacheEntry>()

/**
 * Read one collection into an id-to-name map. Never throws.
 *
 * A collection that fails — network fault, 5xx, or the admin-gated 403 some instances answer on
 * `/users` — yields an empty map and `ok: false`. A name lookup must never be able to turn a
 * successful task fetch into an error, and the two collections fail INDEPENDENTLY: losing the user
 * roster must not also cost the project headings.
 */
async function acNameMap(
  read: () => Promise<readonly { id: number; name: string }[]>
): Promise<{ names: ReadonlyMap<number, string>; ok: boolean }> {
  try {
    const names = new Map<number, string>()
    for (const row of await read()) {
      names.set(row.id, row.name)
    }
    return { names, ok: true }
  } catch {
    return { names: AC_NO_NAMES, ok: false }
  }
}

/** The users twin of acNameMap, keeping whole rows. Same never-throws contract. */
async function acUserMap(
  read: () => Promise<readonly ActiveCollabUser[]>
): Promise<{ users: ReadonlyMap<number, ActiveCollabUser>; ok: boolean }> {
  try {
    const users = new Map<number, ActiveCollabUser>()
    for (const row of await read()) {
      users.set(row.id, row)
    }
    return { users, ok: true }
  } catch {
    return { users: AC_NO_USERS, ok: false }
  }
}

/** Both collections in parallel: they are independent, and serialising them doubles first paint. */
async function acLoadNames(
  http: AcHttpClient
): Promise<{ directory: AcNameDirectory; complete: boolean }> {
  const [projects, users] = await Promise.all([
    acNameMap(() => listProjects({ http })),
    acUserMap(() => listUsers({ http }))
  ])
  return {
    directory: { projects: projects.names, users: users.users },
    complete: projects.ok && users.ok
  }
}

function acBeginLoad(http: AcHttpClient, key: string, startedAt: number): AcNameCacheEntry {
  const directory: Promise<AcNameDirectory> = acLoadNames(http).then((load) => {
    if (!load.complete) {
      const current = acNameCache.get(key)
      // Shorten only OUR OWN entry: a disconnect or a later window may already have replaced it.
      if (current?.directory === directory) {
        current.expiresAt = startedAt + AC_DIRECTORY_RETRY_TTL_MS
      }
    }
    return load.directory
  })
  return { expiresAt: startedAt + AC_DIRECTORY_TTL_MS, directory }
}

/**
 * A loader for one credential's names. Cheap to build and lazy: no request is made until the
 * loader is called, and calling it inside the TTL — from another row, another operation, or a
 * concurrent call that arrived while the first was still in flight — hands back the SAME promise
 * rather than starting a second fetch.
 *
 * Expiry is stamped when the fetch STARTS, not when it settles, which is what makes concurrent
 * callers share one request instead of each deciding the entry is missing.
 */
export function acNameDirectory(args: {
  http: AcHttpClient
  instanceUrl: string
  userId: number
  /** Injected so TTL expiry is testable without real timers. */
  nowImpl?: () => number
}): AcNameDirectoryLoader {
  const now = args.nowImpl ?? Date.now
  const key = `${args.instanceUrl}\u0000${args.userId}`
  return () => {
    const at = now()
    const cached = acNameCache.get(key)
    if (cached !== undefined && at < cached.expiresAt) {
      return cached.directory
    }
    // Sweep on insert: an expired entry for a key never read again would otherwise sit in the
    // map until connect/disconnect — one entry per project/credential visited, all session long.
    for (const [staleKey, staleEntry] of acNameCache) {
      if (at >= staleEntry.expiresAt) {
        acNameCache.delete(staleKey)
      }
    }
    const entry = acBeginLoad(args.http, key, at)
    acNameCache.set(key, entry)
    return entry.directory
  }
}

/**
 * Fill in the names the wire omitted, in place on rows that were just built.
 *
 * Never rejects, and never invents. A name the ROW carried always wins — it is the server's own
 * answer and needs no lookup — and an id the directory cannot resolve keeps its empty/null. That
 * leaves `assigneeId !== null` with `assigneeName === null` intact as its own state, distinct from
 * the `assigneeId === null` that actually means nobody is assigned.
 */
export async function acResolveTaskNames(
  pending: Promise<AcNameDirectory>,
  tasks: readonly (ActiveCollabTask | null)[]
): Promise<void> {
  const directory = await pending
  for (const task of tasks) {
    if (task === null) {
      continue
    }
    if (task.projectName === '' && task.projectId > 0) {
      task.projectName = directory.projects.get(task.projectId) ?? ''
    }
    if (task.assigneeName === null && task.assigneeId !== null) {
      task.assigneeName = directory.users.get(task.assigneeId)?.name ?? null
    }
    if (task.createdByName === null && task.createdById !== null) {
      task.createdByName = directory.users.get(task.createdById)?.name ?? null
    }
  }
}

/**
 * Fill in the assignee names the wire omitted on subtask rows, in place — the subtask twin of
 * {@link acResolveTaskNames}. Same never-rejects, never-invents contract: a name the ROW carried
 * wins, and an id the directory cannot resolve keeps its null.
 */
export async function acResolveSubtaskNames(
  pending: Promise<AcNameDirectory>,
  subtasks: readonly (ActiveCollabSubtask | null)[]
): Promise<void> {
  const directory = await pending
  for (const subtask of subtasks) {
    if (subtask === null) {
      continue
    }
    if (subtask.assigneeName === null && subtask.assigneeId !== null) {
      subtask.assigneeName = directory.users.get(subtask.assigneeId)?.name ?? null
    }
  }
}

/** Drops every cached directory. Called on connect/disconnect, and between tests. */
export function resetAcNameDirectoryCache(): void {
  acNameCache.clear()
}
