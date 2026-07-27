import { describe, expect, it } from 'vitest'

import {
  activeCollabAssigneeLabel,
  activeCollabInitials,
  resolveActiveCollabAssignee
} from './activecollab-task-people'

describe('resolveActiveCollabAssignee', () => {
  it('is unassigned only when there is no assignee id', () => {
    expect(resolveActiveCollabAssignee({ assigneeId: null, assigneeName: null })).toEqual({
      kind: 'unassigned'
    })
  })

  it('carries the name when the directory resolved one', () => {
    expect(resolveActiveCollabAssignee({ assigneeId: 7, assigneeName: 'Jake Varrese' })).toEqual({
      kind: 'named',
      name: 'Jake Varrese'
    })
  })

  it('reports an id with no resolvable name as unresolved, NOT unassigned', () => {
    expect(resolveActiveCollabAssignee({ assigneeId: 407, assigneeName: null })).toEqual({
      kind: 'unresolved'
    })
  })

  it('treats a blank name as unresolved rather than printing whitespace', () => {
    expect(resolveActiveCollabAssignee({ assigneeId: 407, assigneeName: '   ' })).toEqual({
      kind: 'unresolved'
    })
  })

  it('names an otherwise-unresolvable id from the picker roster', () => {
    expect(
      resolveActiveCollabAssignee({ assigneeId: 407, assigneeName: null }, [
        { id: 12, name: 'Ada Lovelace' },
        { id: 407, name: 'Jake Varrese' }
      ])
    ).toEqual({ kind: 'named', name: 'Jake Varrese' })
  })

  it('stays unresolved when the roster does not carry the id', () => {
    expect(
      resolveActiveCollabAssignee({ assigneeId: 90210, assigneeName: null }, [
        { id: 407, name: 'Jake Varrese' }
      ])
    ).toEqual({ kind: 'unresolved' })
  })

  it('never lets a roster name override the one the task shipped', () => {
    expect(
      resolveActiveCollabAssignee({ assigneeId: 407, assigneeName: 'Jacob Varrese' }, [
        { id: 407, name: 'Jake Varrese' }
      ])
    ).toEqual({ kind: 'named', name: 'Jacob Varrese' })
  })

  it('is unassigned regardless of the roster when there is no assignee id', () => {
    expect(
      resolveActiveCollabAssignee({ assigneeId: null, assigneeName: null }, [
        { id: 407, name: 'Jake Varrese' }
      ])
    ).toEqual({ kind: 'unassigned' })
  })
})

describe('activeCollabAssigneeLabel', () => {
  it('gives the three states three distinct strings', () => {
    const labels = [
      activeCollabAssigneeLabel({ kind: 'named', name: 'Jake Varrese' }),
      activeCollabAssigneeLabel({ kind: 'unassigned' }),
      activeCollabAssigneeLabel({ kind: 'unresolved' })
    ]

    expect(labels[0]).toBe('Jake Varrese')
    expect(labels[1]).toBe('Unassigned')
    expect(new Set(labels).size).toBe(3)
  })

  it('never says "Unassigned" for an assignee it merely could not name', () => {
    const label = activeCollabAssigneeLabel({ kind: 'unresolved' })

    expect(label).not.toContain('Unassigned')
    expect(label).toContain('Assigned')
  })
})

describe('activeCollabInitials', () => {
  it('takes the first and last initial', () => {
    expect(activeCollabInitials('Jake Varrese')).toBe('JV')
    expect(activeCollabInitials('Ada Byron King Lovelace')).toBe('AL')
  })

  it('falls back to a single initial for one-word names', () => {
    expect(activeCollabInitials('Jake')).toBe('J')
  })

  it('skips leading non-alphanumerics so a decorated name never yields half a surrogate', () => {
    expect(activeCollabInitials('\u{1F680} Developer')).toBe('D')
  })

  it('answers "?" when nothing in the name is a letter or digit', () => {
    expect(activeCollabInitials('   ')).toBe('?')
    expect(activeCollabInitials('---')).toBe('?')
  })
})
