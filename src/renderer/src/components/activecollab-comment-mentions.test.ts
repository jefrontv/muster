import { describe, expect, it } from 'vitest'

import type { ActiveCollabResult } from '../../../shared/activecollab-api-types'
import {
  acceptActiveCollabMention,
  activeCollabCommentBodyHtml,
  activeCollabMentionPeople,
  activeCollabMentionSuggestions,
  activeCollabMentionToken,
  withActiveCollabMentionPick,
  type ActiveCollabMentionPick
} from './activecollab-comment-mentions'
import type { ActiveCollabUser } from '../../../shared/activecollab-types'

const ADA: ActiveCollabUser = { id: 12, name: 'Ada Lovelace' }
const JAKE: ActiveCollabUser = { id: 407, name: 'Jake Varrese' }
const ALAN: ActiveCollabUser = { id: 88, name: 'Alan Turing' }
const ROSTER = [ADA, ALAN, JAKE]

const NO_PICKS: readonly ActiveCollabMentionPick[] = []

/** Caret at end of draft, which is where it sits while somebody is typing a mention. */
function tokenAtEnd(draft: string, picked: readonly ActiveCollabMentionPick[] = NO_PICKS) {
  return activeCollabMentionToken(draft, draft.length, picked)
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
    expect(activeCollabMentionToken('Ping @al and thanks', 8, NO_PICKS)).toEqual({
      query: 'al',
      at: 5
    })
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

  it('closes over an already-picked name, so the menu does not reopen on its own insertion', () => {
    const picked = [{ name: 'Jake Varrese', id: 407 }]

    expect(tokenAtEnd('Ping @Jake Varrese ', picked)).toBeNull()
  })

  it('reopens on a fresh @ typed after a pick', () => {
    const picked = [{ name: 'Jake Varrese', id: 407 }]

    expect(tokenAtEnd('Ping @Jake Varrese and @ad', picked)).toEqual({ query: 'ad', at: 23 })
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
      name: `Person ${index}`
    }))

    expect(
      activeCollabMentionSuggestions({ users: crowd, query: '', currentUserId: null })
    ).toHaveLength(6)
    expect(
      activeCollabMentionSuggestions({ users: crowd, query: '', currentUserId: null, limit: 2 })
    ).toHaveLength(2)
  })
})

describe('acceptActiveCollabMention', () => {
  it('replaces the token in place and leaves the caret after the inserted name', () => {
    const next = acceptActiveCollabMention({
      draft: 'Ping @jak',
      caret: 9,
      at: 5,
      name: 'Jake Varrese'
    })

    expect(next.draft).toBe('Ping @Jake Varrese ')
    expect(next.caret).toBe(19)
  })

  it('does not disturb the rest of the draft when the caret is mid-sentence', () => {
    const draft = 'Ping @jak about the header'
    const next = acceptActiveCollabMention({ draft, caret: 9, at: 5, name: 'Jake Varrese' })

    // No second space: the draft already had one at the caret.
    expect(next.draft).toBe('Ping @Jake Varrese about the header')
    expect(next.draft.slice(next.caret)).toBe(' about the header')
  })
})

describe('withActiveCollabMentionPick', () => {
  it('records the pick', () => {
    expect(withActiveCollabMentionPick(NO_PICKS, JAKE)).toEqual([{ name: 'Jake Varrese', id: 407 }])
  })

  it('keeps one pick per name so a repicked name cannot address two people at once', () => {
    const picked = withActiveCollabMentionPick([{ name: 'Jake Varrese', id: 999 }], JAKE)

    expect(picked).toEqual([{ name: 'Jake Varrese', id: 407 }])
  })
})

describe('activeCollabCommentBodyHtml', () => {
  it('escapes typed markup so a literal tag cannot become live HTML on the instance', () => {
    expect(activeCollabCommentBodyHtml('<b>bold</b> & "quoted"')).toBe(
      '<p>&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;</p>'
    )
  })

  it('splits blank-line-separated blocks into paragraphs and keeps single breaks', () => {
    expect(activeCollabCommentBodyHtml('one\ntwo\n\nthree')).toBe('<p>one<br>two</p><p>three</p>')
  })

  it('writes the new_mention span the server recognises, while still escaping typed markup', () => {
    // Both halves in ONE body: the span has to survive escaping as real markup in the same pass
    // that turns the author's literal <b> into text.
    const html = activeCollabCommentBodyHtml('@Jake Varrese look at <b>this</b>', [
      { name: 'Jake Varrese', id: 407 }
    ])

    expect(html).toBe(
      '<p><span class="new_mention" data-user-id="407" data-type="user">Jake Varrese</span>' +
        ' look at &lt;b&gt;this&lt;/b&gt;</p>'
    )
  })

  it('escapes the name inside the span, so a name cannot smuggle markup into the body', () => {
    expect(activeCollabCommentBodyHtml('hi @A<b>&"c', [{ name: 'A<b>&"c', id: 5 }])).toBe(
      '<p>hi <span class="new_mention" data-user-id="5" data-type="user">' +
        'A&lt;b&gt;&amp;&quot;c</span></p>'
    )
  })

  it('substitutes the longest name first, so "Jake" cannot eat "Jake Varrese"', () => {
    const html = activeCollabCommentBodyHtml('@Jake Varrese and @Jake', [
      { name: 'Jake', id: 900 },
      { name: 'Jake Varrese', id: 407 }
    ])

    expect(html).toBe(
      '<p><span class="new_mention" data-user-id="407" data-type="user">Jake Varrese</span> and ' +
        '<span class="new_mention" data-user-id="900" data-type="user">Jake</span></p>'
    )
  })

  it('drops a pick the author deleted, rather than notifying somebody for absent text', () => {
    const html = activeCollabCommentBodyHtml('never mind', [{ name: 'Jake Varrese', id: 407 }])

    expect(html).toBe('<p>never mind</p>')
    expect(html).not.toContain('new_mention')
  })

  it('leaves a bare name alone: only the @-prefixed token becomes a mention', () => {
    const html = activeCollabCommentBodyHtml('Jake Varrese reviewed it', [
      { name: 'Jake Varrese', id: 407 }
    ])

    expect(html).toBe('<p>Jake Varrese reviewed it</p>')
  })

  it('DOCUMENTS THE SHARP EDGE: every @Name for a picked person becomes a mention', () => {
    // Substitution is by name, not by caret offset. A second, hand-typed "@Jake Varrese" is
    // therefore also serialised as a mention for the picked id — including when the author meant
    // a different Jake. Accepted deliberately: the alternative, tracking offsets, mis-addresses
    // the span to whatever text a later edit shifted into place, which notifies the WRONG person
    // rather than over-notifying one the author chose.
    const html = activeCollabCommentBodyHtml('@Jake Varrese and also @Jake Varrese', [
      { name: 'Jake Varrese', id: 407 }
    ])

    expect(html.match(/data-user-id="407"/g)).toHaveLength(2)
  })

  it('does not mutate the caller pick list while ordering it', () => {
    const picked = [
      { name: 'Jake', id: 900 },
      { name: 'Jake Varrese', id: 407 }
    ]

    activeCollabCommentBodyHtml('@Jake Varrese', picked)

    expect(picked.map((pick) => pick.id)).toEqual([900, 407])
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
