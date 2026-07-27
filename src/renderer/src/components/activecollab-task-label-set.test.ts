import { describe, expect, it } from 'vitest'

import type { ActiveCollabLabel } from '../../../shared/activecollab-types'
import {
  activeCollabLabelNames,
  hasActiveCollabLabel,
  toggleActiveCollabLabelName
} from './activecollab-task-label-set'

function label(id: number, name: string): ActiveCollabLabel {
  return { id, name, color: null }
}

const CURRENT = [label(1, 'Blocked'), label(2, 'Urgent')]

describe('toggleActiveCollabLabelName', () => {
  it('returns the MERGED set when adding, never the addition alone', () => {
    // A label write REPLACES the task's labels, so returning ['Deferred'] here would delete both
    // existing labels on the next update.
    expect(toggleActiveCollabLabelName(CURRENT, 'Deferred')).toEqual([
      'Blocked',
      'Urgent',
      'Deferred'
    ])
  })

  it('removes only the toggled label and keeps the rest', () => {
    expect(toggleActiveCollabLabelName(CURRENT, 'Blocked')).toEqual(['Urgent'])
  })

  it('removes rather than duplicates when the name differs only by case', () => {
    expect(toggleActiveCollabLabelName(CURRENT, 'blocked')).toEqual(['Urgent'])
  })

  it('adds against an empty set', () => {
    expect(toggleActiveCollabLabelName([], 'Deferred')).toEqual(['Deferred'])
  })

  it('clears the last label to an empty replacement set, not to "leave alone"', () => {
    expect(toggleActiveCollabLabelName([label(1, 'Blocked')], 'Blocked')).toEqual([])
  })

  it('leaves the set untouched for a blank name', () => {
    expect(toggleActiveCollabLabelName(CURRENT, '   ')).toEqual(['Blocked', 'Urgent'])
  })

  it('trims the added name so the write matches the vocabulary entry', () => {
    expect(toggleActiveCollabLabelName(CURRENT, '  Deferred  ')).toEqual([
      'Blocked',
      'Urgent',
      'Deferred'
    ])
  })
})

describe('activeCollabLabelNames', () => {
  it('drops blank names and case-duplicate rows the instance may echo', () => {
    const rows = [label(1, 'Blocked'), label(2, '  '), label(3, 'blocked'), label(4, 'Urgent')]

    expect(activeCollabLabelNames(rows)).toEqual(['Blocked', 'Urgent'])
  })
})

describe('hasActiveCollabLabel', () => {
  it('matches regardless of case so the picker cannot show a false unselected row', () => {
    expect(hasActiveCollabLabel(CURRENT, 'urgent')).toBe(true)
    expect(hasActiveCollabLabel(CURRENT, 'Deferred')).toBe(false)
  })
})
