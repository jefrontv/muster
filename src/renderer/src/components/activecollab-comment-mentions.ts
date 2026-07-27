// Turning a composer draft into the HTML ActiveCollab stores, @mentions included.
//
// The READ and WRITE formats for a mention are DIFFERENT, and only one of them notifies anybody.
// The server hands back `<span class="mention mention-user">Name</span>`; POSTing that same markup
// produces inert text and pings nobody. A mention that actually reaches a person has to be written
// as `<span class="new_mention" data-user-id="ID" data-type="user">Name</span>` — the contract
// quoted from the ActiveCollab server source by the reference client
// (active-collab-notifications, CollabBarCore/ACClient.swift:222).
//
// Picked mentions are carried as {name, id} and substituted BY NAME at serialise time rather than
// by caret offset. Offsets are the obvious alternative and the wrong one: every edit earlier in the
// draft shifts them, so a stale offset does not merely drop a mention, it addresses the span at
// whatever text now sits there and notifies the wrong colleague. Name substitution can only ever
// over-apply to a person the author explicitly picked, which is the failure worth having, and it is
// the behaviour already proven against this server. The sharp edge it keeps: a SECOND, hand-typed
// `@Jake Varrese` elsewhere in the body also becomes a mention for the picked Jake — including when
// the author meant a different Jake. Documented by test rather than papered over.

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

/** One resolved mention: the name as it appears in the draft, and who it addresses. */
export type ActiveCollabMentionPick = {
  name: string
  id: number
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
 * `picked` closes it again after a pick lands: the inserted text still reads as a token, so without
 * this the menu would reopen over the name it just wrote.
 */
export function activeCollabMentionToken(
  draft: string,
  caret: number,
  picked: readonly ActiveCollabMentionPick[]
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
  if (picked.some((pick) => query.startsWith(pick.name))) {
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

/**
 * Replace the token in place with `@Name`, leaving everything past the caret untouched and the
 * caret directly after the name so typing continues where the author left off.
 *
 * The trailing space is a separator, not decoration: it is skipped when the draft already has
 * whitespace at the caret, so accepting mid-sentence does not leave a double space behind.
 */
export function acceptActiveCollabMention(args: {
  draft: string
  caret: number
  at: number
  name: string
}): { draft: string; caret: number } {
  const tail = args.draft.slice(args.caret)
  const head = `${args.draft.slice(0, args.at)}@${args.name}${/^\s/.test(tail) ? '' : ' '}`
  return { draft: head + tail, caret: head.length }
}

/** One pick per name, latest wins: two people sharing a display name cannot both be addressable. */
export function withActiveCollabMentionPick(
  picked: readonly ActiveCollabMentionPick[],
  user: ActiveCollabUser
): ActiveCollabMentionPick[] {
  const kept = picked.filter((pick) => pick.name !== user.name)
  kept.push({ name: user.name, id: user.id })
  return kept
}

function escapeCommentHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Spans go in AFTER escaping, never before, or the markup is escaped into visible text. The needle
 * is escaped with the same function as the haystack so a name containing `&` still matches, and the
 * span's own text carries that escaping through.
 *
 * `split`/`join` rather than a regex: a display name is arbitrary text and would otherwise need
 * regex-escaping on top of HTML-escaping.
 */
function injectMentionSpans(escaped: string, ordered: readonly ActiveCollabMentionPick[]): string {
  let html = escaped
  for (const mention of ordered) {
    const name = escapeCommentHtml(mention.name)
    html = html
      .split(`@${name}`)
      .join(
        `<span class="new_mention" data-user-id="${mention.id}" data-type="user">${name}</span>`
      )
  }
  return html
}

/**
 * ActiveCollab stores comment bodies as HTML, so the composer's plain text is escaped and wrapped
 * rather than posted raw — otherwise a typed `<b>` would become live markup on the instance.
 *
 * A pick whose `@Name` is no longer in the draft simply finds nothing to replace and is dropped:
 * notifying somebody for text the author deleted is worse than losing the mention.
 */
export function activeCollabCommentBodyHtml(
  text: string,
  mentions: readonly ActiveCollabMentionPick[] = []
): string {
  // Longest name first, so a picked "Jake Varrese" is consumed whole before a separately picked
  // "Jake" can eat its prefix and strand " Varrese" outside the span.
  const ordered = [...mentions].sort((left, right) => right.name.length - left.name.length)
  return text
    .split(/\n{2,}/)
    .map((paragraph) => escapeCommentHtml(paragraph).replace(/\n/g, '<br>'))
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${injectMentionSpans(paragraph, ordered)}</p>`)
    .join('')
}
