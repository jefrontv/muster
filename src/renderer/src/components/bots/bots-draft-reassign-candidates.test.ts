// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  reassignCandidates,
  rememberReassign,
  rememberedReassign
} from './bots-draft-reassign-candidates'
import { filterMembers } from './BotsReassignMemberMenu'

const mention = (id: number, name: string): string =>
  `<span class="new_mention" data-user-id="${id}" data-type="user">${name}</span>`

describe('reassign candidates', () => {
  afterEach(() => localStorage.clear())

  it('orders remembered, mentioned, delegator, creator, each once and never you', () => {
    const people = reassignCandidates({
      remembered: { userId: 4, name: 'Dana' },
      bodyHtml: `<p>Hi ${mention(9, 'Felicity')} and ${mention(1, 'Me')} and ${mention(4, 'Dana')}</p>`,
      handBackPeople: [
        { userId: 5, name: 'Efront Feedback', role: 'delegator' },
        { userId: 9, name: 'Felicity', role: 'creator' }
      ],
      selfId: 1
    })
    expect(people.map((person) => person.userId)).toEqual([4, 9, 5])
  })

  it('falls back to the task people when nothing is mentioned or remembered', () => {
    const people = reassignCandidates({
      remembered: null,
      bodyHtml: '<p>Done</p>',
      handBackPeople: [{ userId: 5, name: 'Sarah', role: 'creator' }],
      selfId: 1
    })
    expect(people).toEqual([{ userId: 5, name: 'Sarah' }])
  })

  it('remembers the pick per project and ignores junk in storage', () => {
    rememberReassign(31, { userId: 9, name: 'Felicity' })
    expect(rememberedReassign(31)).toEqual({ userId: 9, name: 'Felicity' })
    expect(rememberedReassign(32)).toBeNull()
    localStorage.setItem('muster.bots.reassign.33', '{"userId":"x"}')
    expect(rememberedReassign(33)).toBeNull()
  })

  it('filters members by name, sorted, without you', () => {
    const users = [
      { id: 3, name: 'Zoe', avatarUrl: null },
      { id: 1, name: 'Me', avatarUrl: null },
      { id: 9, name: 'Felicity Lemke', avatarUrl: null },
      { id: 7, name: 'Fred', avatarUrl: null }
    ]
    expect(filterMembers(users, '', 1).map((user) => user.name)).toEqual([
      'Felicity Lemke',
      'Fred',
      'Zoe'
    ])
    expect(filterMembers(users, 'lem', 1).map((user) => user.name)).toEqual(['Felicity Lemke'])
  })
})
