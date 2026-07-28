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
 * People worth offering for this token. The connected user is excluded outright: ActiveCollab has
 * no self-mention, so listing yourself only offers a pick that notifies nobody.
 *
 * An empty query lists people rather than nothing — a bare `@` is a request to browse.
 */
export function activeCollabMentionSuggestions(args: {
  users: readonly ActiveCollabUser[]
  query: string
  currentUserId: number | null
  limit?: number
}): ActiveCollabUser[] {
  const needle = args.query.trim().toLowerCase()
  const limit = args.limit ?? ACTIVECOLLAB_MENTION_LIMIT
  const matches: ActiveCollabUser[] = []
  for (const user of args.users) {
    if (user.id <= 0 || user.id === args.currentUserId) {
      continue
    }
    if (needle !== '' && !user.name.toLowerCase().includes(needle)) {
      continue
    }
    matches.push(user)
    if (matches.length === limit) {
      break
    }
  }
  return matches
}
