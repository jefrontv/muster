// Who is actually on a project, named — the list an @mention menu should be offering.
//
// `GET projects/{id}` answers membership as BARE USER IDS under `single.members`. Verified against
// projects.efront.com.au 8.0.31, where `projects/5937` reports `[1, 7, 267, 407, 576, 902, 1027]`:
// seven people, against the 176 the instance-wide roster carries. The reference client
// (active-collab-notifications, CollabBarCore/ACClient.swift:210) also accepts a top-level
// `members`, so both envelopes are read rather than assumed.
//
// Names come from the SAME roster the assignee join uses, never a second `/users` read. Two name
// sources drift, and a mention menu that spells a colleague differently from the assignee row an
// inch above it is a bug nobody can explain. All seven of those ids resolved in the roster, so the
// intersection costs nothing on the live instance.
//
// Credential-keyed for the reason name-directory.ts is: the ipc layer builds a fresh client per
// call precisely so a reconnect can swap credentials mid-flight, and a map keyed on the project id
// alone would serve one account the membership of another account's project.

import type { ActiveCollabUser } from '../../shared/activecollab-types'
import { acIsRecord, acNullableId } from './codecs'
import type { AcHttpClient } from './http'
import {
  AC_DIRECTORY_RETRY_TTL_MS,
  AC_DIRECTORY_TTL_MS,
  type AcNameDirectoryLoader
} from './name-directory'

/** Resolves one project's members. NEVER rejects — see {@link acLoadProjectMembers}. */
export type AcProjectMembersLoader = (projectId: number) => Promise<ActiveCollabUser[]>

type AcProjectMembersEntry = {
  expiresAt: number
  members: Promise<ActiveCollabUser[]>
}

/** Keyed `instanceUrl + userId + projectId`; the token stays out of it, as in name-directory.ts. */
const acProjectMembersCache = new Map<string, AcProjectMembersEntry>()

/**
 * `single.members` first, a bare `members` second. Entries are bare ids on 8.0.31; a record
 * carrying `id` is accepted as well, because that is the only other shape ActiveCollab uses for a
 * membership list and tolerating it costs one branch. `acNullableId` drops the `0` sentinel.
 */
function acMemberIds(payload: unknown): number[] {
  const root = acIsRecord(payload) ? payload : {}
  const single = acIsRecord(root.single) ? root.single : null
  const raw = single?.members ?? root.members
  if (!Array.isArray(raw)) {
    return []
  }
  const ids: number[] = []
  for (const entry of raw) {
    const id = acNullableId(acIsRecord(entry) ? entry.id : entry)
    if (id !== null) {
      ids.push(id)
    }
  }
  return ids
}

/**
 * The project's members, named. Never throws: a fetch fault, an unparseable envelope and a genuine
 * empty membership all answer `[]`, which is the renderer's agreed signal to offer the whole roster
 * instead of an empty menu.
 *
 * A member id the roster cannot name is DROPPED rather than labelled `User 902`. The menu is
 * searched by name and a pick writes that name into the comment body, so a synthetic label is a
 * row nobody can find that posts noise if they do. Losing every member that way takes the list to
 * empty, which falls back to the roster — the honest answer when we know there are members but
 * cannot say who.
 *
 * `ok` is narrower than "did not throw": a membership we could not name a single person from is
 * reported as failed so the entry expires on the short retry window rather than pinning an empty
 * list for five minutes behind a roster that was only briefly unavailable.
 */
async function acLoadProjectMembers(args: {
  http: AcHttpClient
  names: AcNameDirectoryLoader
  projectId: number
}): Promise<{ members: ActiveCollabUser[]; ok: boolean }> {
  try {
    // Parallel: the roster is usually already warm, and serialising costs a round trip when it is
    // not — the author is mid-keystroke behind this.
    const [response, directory] = await Promise.all([
      args.http.request<unknown>(`projects/${args.projectId}`),
      args.names()
    ])
    const ids = acMemberIds(response.data)
    const members: ActiveCollabUser[] = []
    for (const id of ids) {
      const user = directory.users.get(id)
      if (user !== undefined) {
        members.push(user)
      }
    }
    // Sorted by name so a capped suggestion list is stable between keystrokes, matching the roster.
    members.sort((left, right) => left.name.localeCompare(right.name))
    return { members, ok: ids.length === 0 || members.length > 0 }
  } catch {
    return { members: [], ok: false }
  }
}

function acBeginMembersLoad(
  args: { http: AcHttpClient; names: AcNameDirectoryLoader; projectId: number },
  key: string,
  startedAt: number
): AcProjectMembersEntry {
  const members: Promise<ActiveCollabUser[]> = acLoadProjectMembers(args).then((load) => {
    if (!load.ok) {
      const current = acProjectMembersCache.get(key)
      // Shorten only OUR OWN entry: a disconnect or a later window may already have replaced it.
      if (current?.members === members) {
        current.expiresAt = startedAt + AC_DIRECTORY_RETRY_TTL_MS
      }
    }
    return load.members
  })
  return { expiresAt: startedAt + AC_DIRECTORY_TTL_MS, members }
}

/**
 * A loader for one credential's project memberships. Cheap to build and lazy: no request is made
 * until it is called with a project id, and calling it again inside the TTL — from a second
 * composer, or from a concurrent call that arrived while the first was still in flight — hands back
 * the SAME promise rather than starting a second fetch.
 *
 * Expiry is stamped when the fetch STARTS, not when it settles, which is what makes concurrent
 * callers share one request instead of each deciding the entry is missing.
 */
export function acProjectMembers(args: {
  http: AcHttpClient
  names: AcNameDirectoryLoader
  instanceUrl: string
  userId: number
  /** Injected so TTL expiry is testable without real timers. */
  nowImpl?: () => number
}): AcProjectMembersLoader {
  const now = args.nowImpl ?? Date.now
  const prefix = `${args.instanceUrl}\u0000${args.userId}`
  return (projectId) => {
    const key = `${prefix}\u0000${projectId}`
    const at = now()
    const cached = acProjectMembersCache.get(key)
    if (cached !== undefined && at < cached.expiresAt) {
      return cached.members
    }
    // Sweep on insert — same growth trap as name-directory: one dead entry per project visited,
    // held until connect/disconnect.
    for (const [staleKey, staleEntry] of acProjectMembersCache) {
      if (at >= staleEntry.expiresAt) {
        acProjectMembersCache.delete(staleKey)
      }
    }
    const entry = acBeginMembersLoad({ http: args.http, names: args.names, projectId }, key, at)
    acProjectMembersCache.set(key, entry)
    return entry.members
  }
}

/** Drops every cached membership. Called on connect/disconnect, and between tests. */
export function resetAcProjectMembersCache(): void {
  acProjectMembersCache.clear()
}
