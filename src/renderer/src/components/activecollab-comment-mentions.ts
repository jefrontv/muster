// Who the composer offers when the author types `@`, and how much of the draft that `@` claims.
//
// Deliberately free of any editor dependency: this is text-and-people logic, and keeping it that
// way is what lets it be exercised without a document. Turning a token into an actual mention is
// `activecollab-comment-mention-document`, which owns the ProseMirror side.

import type { ActiveCollabResult } from '../../../shared/activecollab-api-types'
import type { ActiveCollabUser } from '../../../shared/activecollab-types'

/** People to offer, and whether they are the project's members or the whole-instance fallback. */
export type ActiveCollabMentionPeople = {
  users: readonly ActiveCollabUser[]
  scoped: boolean
}

/**
 * The people this composer should offer: the members of the task's project, or the whole roster
 * when that cannot be delivered.
 *
 * The fallback is the point of this function. A members read that fails, or answers a membership
 * the roster cannot name anybody from, must NOT produce an empty menu — that reads as "nobody
 * exists" and blocks a mention the author is entitled to make, for a reason they can neither see
 * nor fix. A worse list that works beats a correct-looking list of nobody, and `scoped: false`
 * carries the difference to the menu so it can say which one this is.
 *
 * Costs one request in the normal case: the roster is only asked for when the members read did not
 * answer with people.
 */
export async function activeCollabMentionPeople(args: {
  projectId: number | null
  listProjectMembers: (projectId: number) => Promise<ActiveCollabResult<ActiveCollabUser[]>>
  listUsers: () => Promise<ActiveCollabResult<ActiveCollabUser[]>>
}): Promise<ActiveCollabMentionPeople> {
  if (args.projectId !== null && args.projectId > 0) {
    const members = await args.listProjectMembers(args.projectId)
    if (members.ok && members.value.length > 0) {
      return { users: members.value, scoped: true }
    }
  }
  const roster = await args.listUsers()
  return { users: roster.ok ? roster.value : [], scoped: false }
}

/** An active `@partial` token: the text typed after the `@`, and where that `@` sits. */
export type ActiveCollabMentionToken = {
  query: string
  at: number
}

/**
 * Past this many characters after the `@` the author is writing prose, not choosing a person, and
 * a menu that stayed open would sit over the draft for the rest of the paragraph.
 */
const MENTION_QUERY_MAX = 30

/** Six, matching the reference client: enough to choose from without covering the draft. */
export const ACTIVECOLLAB_MENTION_LIMIT = 6

/**
 * A `@` glued to a word is part of an address or a handle (`ada@efront.com.au`), not a mention.
 * Punctuation is not: `(@ada` is somebody being mentioned inside a parenthetical.
 */
const MENTION_TOKEN_BOUNDARY = /[\p{L}\p{N}._@-]/u

/**
 * The `@partial` token under the caret, or null when the menu should be shut.
 *
 * No suppression list any more. The old text composer had to remember which names it had already
 * inserted, because an accepted `@Ada Lovelace` still read as a token and would reopen the menu
 * over its own insertion. An accepted mention is now a node, so there is no text left to re-match
 * and nothing to suppress.
 */
export function activeCollabMentionToken(
  draft: string,
  caret: number
): ActiveCollabMentionToken | null {
  const before = draft.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0 || (at > 0 && MENTION_TOKEN_BOUNDARY.test(before[at - 1]))) {
    return null
  }
  const query = before.slice(at + 1)
  if (query.length > MENTION_QUERY_MAX || query.includes('\n')) {
    return null
  }
  return { query, at }
}

/**
 * How well a name answers a query: 0 best, 3 no match.
 *
 * First name first, because that is how people address each other and how they type. `@m` used to
 * put "Alfredo Mendoza" above "Milli Lasky" — both contain an m, and the roster order decided the
 * rest — so the person whose name actually begins with the letter typed came third.
 *
 * Tier 1 keeps surname matches useful: typing `@mendoza` should still find Alfredo. Tier 2 is the
 * plain substring, which is what makes `@mke` reach "Lemke" at all.
 */
function mentionMatchRank(name: string, needle: string): number {
  const lowered = name.toLowerCase()
  if (lowered.startsWith(needle)) {
    return 0
  }
  if (lowered.split(/\s+/).some((word) => word.startsWith(needle))) {
    return 1
  }
  return lowered.includes(needle) ? 2 : 3
}

/**
 * People worth offering for this token, best match first. The connected user is excluded outright:
 * ActiveCollab has no self-mention, so listing yourself only offers a pick that notifies nobody.
 *
 * An empty query lists people rather than nothing — a bare `@` is a request to browse.
 *
 * Every candidate is ranked before the list is cut to `limit`. Cutting while scanning, which is
 * what this did, meant the six kept were the first six in roster order: on a 200-person instance
 * the person whose first name you had just typed could be ranked out of a list they should have
 * topped, purely because five weaker matches came earlier in the roster.
 */
export function activeCollabMentionSuggestions(args: {
  users: readonly ActiveCollabUser[]
  query: string
  currentUserId: number | null
  limit?: number
}): ActiveCollabUser[] {
  const needle = args.query.trim().toLowerCase()
  const limit = args.limit ?? ACTIVECOLLAB_MENTION_LIMIT
  const eligible = args.users.filter(
    (user) => user.id > 0 && user.id !== args.currentUserId
  )
  if (needle === '') {
    return eligible.slice(0, limit)
  }
  return eligible
    .map((user, index) => ({ user, rank: mentionMatchRank(user.name, needle), index }))
    .filter((entry) => entry.rank < 3)
    // The index tie-break keeps the roster's own order within a tier, so an equally good match
    // does not jump around as the query grows.
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, limit)
    .map((entry) => entry.user)
}

/**
 * Project members first, then everyone else when the members answer nothing.
 *
 * Why the second half exists: the menu is scoped to the task's project, which is right almost
 * always — you mention the people on the job. But a query that matches no member produced an empty
 * menu and no explanation, and an empty menu is indistinguishable from a broken one. Someone typing
 * a colleague's name on a project that colleague is not a member of saw mentions simply not work.
 *
 * The roster is only consulted when the scoped list has nothing to offer, so the common case still
 * costs one request and still puts the project's own people at the top.
 */
export function activeCollabMentionSuggestionsWithFallback(args: {
  members: readonly ActiveCollabUser[]
  /** Null until the whole-instance roster has been fetched, which happens only when needed. */
  roster: readonly ActiveCollabUser[] | null
  query: string
  currentUserId: number | null
  limit?: number
}): ActiveCollabMentionPeople {
  const scoped = activeCollabMentionSuggestions({
    users: args.members,
    query: args.query,
    currentUserId: args.currentUserId,
    limit: args.limit
  })
  if (scoped.length > 0 || args.query.trim() === '' || args.roster === null) {
    return { users: scoped, scoped: true }
  }
  const wider = activeCollabMentionSuggestions({
    users: args.roster,
    query: args.query,
    currentUserId: args.currentUserId,
    limit: args.limit
  })
  // Still scoped when the wider search also found nobody: there is no list to explain.
  return wider.length > 0 ? { users: wider, scoped: false } : { users: [], scoped: true }
}
