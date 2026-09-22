import { describe, expect, it } from 'vitest'

import type { ActiveCollabResult } from '../../../shared/activecollab-api-types'
import {
  activeCollabMentionPeople,
  activeCollabMentionSuggestions,
  activeCollabMentionSuggestionsWithFallback,
  activeCollabMentionToken
} from './activecollab-comment-mentions'
import type { ActiveCollabUser } from '../../../shared/activecollab-types'

const ADA: ActiveCollabUser = { id: 12, name: 'Ada Lovelace', avatarUrl: null }
const JAKE: ActiveCollabUser = { id: 407, name: 'Jake Varrese', avatarUrl: null }
const ALAN: ActiveCollabUser = { id: 88, name: 'Alan Turing', avatarUrl: null }
const ROSTER = [ADA, ALAN, JAKE]

/** Caret at end of draft, which is where it sits while somebody is typing a mention. */
function tokenAtEnd(draft: string) {
  return activeCollabMentionToken(draft, draft.length)
}

describe('activeCollabMentionToken', () => {
  it('opens on a bare @ so the author can browse rather than having to guess a name', () => {
    expect(tokenAtEnd('Ping @')).toEqual({ query: '', at: 5 })
  })

  it('carries the partial typed after the @', () => {
    expect(tokenAtEnd('Ping @al')).toEqual({ query: 'al', at: 5 })
  })

  it('reads the token under the caret, not the end of the draft', () => {
    // Caret sits after "@al"; " and thanks" trails it and must not join the query.
    expect(activeCollabMentionToken('Ping @al and thanks', 8)).toEqual({ query: 'al', at: 5 })
  })

  it('stays shut for an @ glued to a word, which is an address and not a mention', () => {
    expect(tokenAtEnd('mail ada@efront.com.au')).toBeNull()
  })

  it('opens after punctuation, because "(@ada" is still somebody being mentioned', () => {
    expect(tokenAtEnd('see (@ad')).toEqual({ query: 'ad', at: 5 })
  })

  it('closes once the token runs past a name and into prose', () => {
    expect(tokenAtEnd(`@${'x'.repeat(31)}`)).toBeNull()
  })

  it('closes when the token crosses a newline, so an @ typed a line ago stays shut', () => {
    expect(tokenAtEnd('@ada\nsecond line')).toBeNull()
  })

  it('needs no suppression list, because an accepted mention leaves no text to re-match', () => {
    // The old text composer had to remember every name it had inserted: the inserted "@Ada Lovelace"
    // still read as a token and would reopen the menu over its own insertion. A mention is now a
    // node, which this function never sees as text at all — the placeholder the caller substitutes
    // for an inline leaf is not a word character, so it neither continues a query nor starts one.
    expect(tokenAtEnd('Ping \uFFFC and thanks')).toBeNull()
    expect(tokenAtEnd('Ping \uFFFC@ad')).toEqual({ query: 'ad', at: 6 })
  })
})

describe('activeCollabMentionSuggestions', () => {
  it('lists people for an empty query rather than showing nothing', () => {
    const suggestions = activeCollabMentionSuggestions({
      users: ROSTER,
      query: '',
      currentUserId: null
    })

    expect(suggestions).toEqual(ROSTER)
  })

  it('filters case-insensitively on any part of the name', () => {
    // "LA" is mid-word in both "Ada Lovelace" and "Alan Turing", and absent from "Jake Varrese".
    expect(
      activeCollabMentionSuggestions({ users: ROSTER, query: 'LA', currentUserId: null })
    ).toEqual([ADA, ALAN])
    expect(
      activeCollabMentionSuggestions({ users: ROSTER, query: 'varrese', currentUserId: null })
    ).toEqual([JAKE])
  })

  it('puts a first-name match above a surname match', () => {
    // The reported case: `@m` listed Alfredo Mendoza, then Felicity Lemke, then Milli Lasky.
    const ALFREDO: ActiveCollabUser = { id: 1, name: 'Alfredo Mendoza', avatarUrl: null }
    const FELICITY: ActiveCollabUser = { id: 2, name: 'Felicity Lemke', avatarUrl: null }
    const MILLI: ActiveCollabUser = { id: 3, name: 'Milli Lasky', avatarUrl: null }
    expect(
      activeCollabMentionSuggestions({
        users: [ALFREDO, FELICITY, MILLI],
        query: 'm',
        currentUserId: null
      })
    ).toEqual([MILLI, ALFREDO, FELICITY])
  })

  it('still finds someone by surname', () => {
    const ALFREDO: ActiveCollabUser = { id: 1, name: 'Alfredo Mendoza', avatarUrl: null }
    expect(
      activeCollabMentionSuggestions({ users: [ADA, ALFREDO], query: 'mendoza', currentUserId: null })
    ).toEqual([ALFREDO])
  })

  it('still finds a match mid-word, which no prefix rule would reach', () => {
    const FELICITY: ActiveCollabUser = { id: 2, name: 'Felicity Lemke', avatarUrl: null }
    expect(
      activeCollabMentionSuggestions({ users: [FELICITY], query: 'mke', currentUserId: null })
    ).toEqual([FELICITY])
  })

  it('keeps roster order within one tier, so equal matches do not shuffle', () => {
    const MIA: ActiveCollabUser = { id: 1, name: 'Mia Carter', avatarUrl: null }
    const MILO: ActiveCollabUser = { id: 2, name: 'Milo Drake', avatarUrl: null }
    expect(
      activeCollabMentionSuggestions({ users: [MIA, MILO], query: 'mi', currentUserId: null })
    ).toEqual([MIA, MILO])
  })

  it('ranks the whole roster before cutting to the limit', () => {
    // Five weaker matches ahead of the best one used to push it out of the list entirely.
    const weak = Array.from({ length: 8 }, (_unused, index) => ({
      id: 100 + index,
      name: `Zoe Marsh${index}`,
      avatarUrl: null
    }))
    const best: ActiveCollabUser = { id: 9, name: 'Marcus Reed', avatarUrl: null }
    const suggestions = activeCollabMentionSuggestions({
      users: [...weak, best],
      query: 'mar',
      currentUserId: null
    })
    expect(suggestions[0]).toEqual(best)
  })

  it('never suggests the connected user, because ActiveCollab has no self-mention', () => {
    const suggestions = activeCollabMentionSuggestions({
      users: ROSTER,
      query: '',
      currentUserId: JAKE.id
    })

    expect(suggestions).toEqual([ADA, ALAN])
    expect(suggestions.some((user) => user.id === JAKE.id)).toBe(false)
  })

  it('excludes the connected user even when the query names them exactly', () => {
    expect(
      activeCollabMentionSuggestions({
        users: ROSTER,
        query: 'Jake Varrese',
        currentUserId: JAKE.id
      })
    ).toEqual([])
  })

  it('caps the list so the menu cannot cover the draft it is helping write', () => {
    const crowd = Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      name: `Person ${index}`,
      avatarUrl: null
    }))

    expect(
      activeCollabMentionSuggestions({ users: crowd, query: '', currentUserId: null })
    ).toHaveLength(6)
    expect(
      activeCollabMentionSuggestions({ users: crowd, query: '', currentUserId: null, limit: 2 })
    ).toHaveLength(2)
  })
})

describe('activeCollabMentionPeople', () => {
  const MEMBERS = [ADA, JAKE]

  function reads(
    members: ActiveCollabResult<ActiveCollabUser[]>,
    roster: ActiveCollabResult<ActiveCollabUser[]> = { ok: true, value: ROSTER }
  ) {
    const calls: string[] = []
    return {
      calls,
      projectId: 5937,
      listProjectMembers: async (projectId: number) => {
        calls.push(`members:${projectId}`)
        return members
      },
      listUsers: async () => {
        calls.push('users')
        return roster
      }
    }
  }

  it('offers the project members, and never reads the roster it did not need', async () => {
    const args = reads({ ok: true, value: MEMBERS })

    await expect(activeCollabMentionPeople(args)).resolves.toEqual({
      users: MEMBERS,
      scoped: true
    })
    expect(args.calls).toEqual(['members:5937'])
  })

  it('falls back to the whole roster when the membership read FAILS', async () => {
    // The failure the ticket is about: an empty menu reads as "nobody exists" and blocks a mention
    // the author is entitled to make, for a reason they can neither see nor fix.
    const args = reads({ ok: false, kind: 'api', error: 'Service unavailable', status: 503 })

    await expect(activeCollabMentionPeople(args)).resolves.toEqual({
      users: ROSTER,
      scoped: false
    })
    expect(args.calls).toEqual(['members:5937', 'users'])
  })

  it('falls back to the whole roster when the membership comes back EMPTY', async () => {
    const args = reads({ ok: true, value: [] })

    await expect(activeCollabMentionPeople(args)).resolves.toEqual({
      users: ROSTER,
      scoped: false
    })
  })

  it('goes straight to the roster when there is no project to scope to', async () => {
    const args = { ...reads({ ok: true, value: MEMBERS }), projectId: null }

    await expect(activeCollabMentionPeople(args)).resolves.toEqual({
      users: ROSTER,
      scoped: false
    })
    expect(args.calls).toEqual(['users'])
  })

  it('answers nobody only when BOTH reads fail, which is the one case with nothing to show', async () => {
    const args = reads(
      { ok: true, value: [] },
      { ok: false, kind: 'auth', error: 'Access denied', status: 403 }
    )

    await expect(activeCollabMentionPeople(args)).resolves.toEqual({ users: [], scoped: false })
  })
})

describe('activeCollabMentionSuggestionsWithFallback', () => {
  const MEMBERS = [
    { id: 1, name: 'Paul Borella', avatarUrl: null },
    { id: 2, name: 'Nicky Deev', avatarUrl: null }
  ]
  const ROSTER = [...MEMBERS, { id: 3, name: 'Milli Lasky', avatarUrl: null }]

  it('offers project members and says so', () => {
    expect(
      activeCollabMentionSuggestionsWithFallback({
        members: MEMBERS,
        roster: ROSTER,
        query: 'paul',
        currentUserId: null
      })
    ).toEqual({ users: [MEMBERS[0]], scoped: true })
  })

  it('reaches the wider roster when no member matches', () => {
    // The reported case: typing a colleague's name on a project they are not a member of showed
    // an empty menu, which is indistinguishable from mentions being broken.
    expect(
      activeCollabMentionSuggestionsWithFallback({
        members: MEMBERS,
        roster: ROSTER,
        query: 'milli',
        currentUserId: null
      })
    ).toEqual({ users: [ROSTER[2]], scoped: false })
  })

  it('does not widen a bare @, which is a request to browse this project', () => {
    const result = activeCollabMentionSuggestionsWithFallback({
      members: MEMBERS,
      roster: ROSTER,
      query: '',
      currentUserId: null
    })
    expect(result).toEqual({ users: MEMBERS, scoped: true })
  })

  it('does not widen before the roster has been fetched', () => {
    expect(
      activeCollabMentionSuggestionsWithFallback({
        members: MEMBERS,
        roster: null,
        query: 'milli',
        currentUserId: null
      })
    ).toEqual({ users: [], scoped: true })
  })

  it('stays scoped when nobody anywhere matches, since there is no wider list to explain', () => {
    expect(
      activeCollabMentionSuggestionsWithFallback({
        members: MEMBERS,
        roster: ROSTER,
        query: 'zzzz',
        currentUserId: null
      })
    ).toEqual({ users: [], scoped: true })
  })

  it('keeps first-name-first ranking inside the widened list', () => {
    const wide = [
      { id: 4, name: 'Alfredo Mendoza', avatarUrl: null },
      { id: 5, name: 'Milli Lasky', avatarUrl: null }
    ]
    const result = activeCollabMentionSuggestionsWithFallback({
      members: MEMBERS,
      roster: wide,
      query: 'm',
      currentUserId: null
    })
    expect(result.users.map((user) => user.name)).toEqual(['Milli Lasky', 'Alfredo Mendoza'])
  })
})
