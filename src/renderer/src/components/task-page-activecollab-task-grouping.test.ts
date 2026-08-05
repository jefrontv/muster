import { describe, expect, it } from 'vitest'

import {
  groupActiveCollabTasksByProject,
  type ActiveCollabTaskGroup
} from './task-page-activecollab-task-grouping'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'

// Local midnights, so nothing here depends on the machine's offset.
const MARCH_14 = new Date(2026, 2, 14).getTime()
const MARCH_15 = new Date(2026, 2, 15).getTime()
const APRIL_01 = new Date(2026, 3, 1).getTime()

function task(overrides: Partial<ActiveCollabTask> & { id: number }): ActiveCollabTask {
  return {
    projectId: 7,
    projectName: 'Muster',
    taskNumber: overrides.id,
    name: `Task ${overrides.id}`,
    bodyHtml: '',
    isCompleted: false,
    startOn: null,
    dueOn: null,
    createdOn: null,
    updatedOn: null,
    assigneeId: null,
    assigneeName: null,
    createdById: null,
    createdByName: null,
    labels: [],
    commentCount: 0,
    urlPath: `/tasks/${overrides.id}`,
    taskListId: null,
    ...overrides
  }
}

function idsByProject(groups: ActiveCollabTaskGroup[]): [string, number[]][] {
  return groups.map((group) => [group.projectName, group.tasks.map((entry) => entry.id)])
}

describe('groupActiveCollabTasksByProject grouping', () => {
  it('files every task under its own project and counts them there', () => {
    const groups = groupActiveCollabTasksByProject([
      task({ id: 1, projectId: 10, projectName: 'Alpha' }),
      task({ id: 2, projectId: 20, projectName: 'Beta' }),
      task({ id: 3, projectId: 10, projectName: 'Alpha' })
    ])

    expect(idsByProject(groups)).toEqual([
      ['Alpha', [3, 1]],
      ['Beta', [2]]
    ])
    expect(groups.map((group) => group.projectId)).toEqual([10, 20])
  })

  it('keeps two same-named projects apart, because the id is the identity', () => {
    const groups = groupActiveCollabTasksByProject([
      task({ id: 1, projectId: 99, projectName: 'Website' }),
      task({ id: 2, projectId: 12, projectName: 'Website' })
    ])

    expect(groups.map((group) => group.projectId)).toEqual([12, 99])
  })

  it('renders a single-project list as one group holding every row', () => {
    const groups = groupActiveCollabTasksByProject([
      task({ id: 1, dueOn: MARCH_15 }),
      task({ id: 2, dueOn: MARCH_14 }),
      task({ id: 3 })
    ])

    expect(groups).toHaveLength(1)
    expect(idsByProject(groups)).toEqual([['Muster', [2, 1, 3]]])
  })

  it('answers an empty read with no groups at all', () => {
    expect(groupActiveCollabTasksByProject([])).toEqual([])
  })
})

describe('groupActiveCollabTasksByProject ordering', () => {
  it('orders groups by project name A to Z regardless of arrival order', () => {
    const groups = groupActiveCollabTasksByProject([
      task({ id: 1, projectId: 1, projectName: 'Zephyr' }),
      task({ id: 2, projectId: 2, projectName: 'Muster' }),
      task({ id: 3, projectId: 3, projectName: 'Aurora' })
    ])

    expect(groups.map((group) => group.projectName)).toEqual(['Aurora', 'Muster', 'Zephyr'])
  })

  it('sorts project names case-insensitively instead of exiling lowercase past Z', () => {
    const groups = groupActiveCollabTasksByProject([
      task({ id: 1, projectId: 1, projectName: 'Zephyr' }),
      task({ id: 2, projectId: 2, projectName: 'aurora' })
    ])

    expect(groups.map((group) => group.projectName)).toEqual(['aurora', 'Zephyr'])
  })

  it('breaks a project-name tie on the project id, so the order is total', () => {
    const groups = groupActiveCollabTasksByProject([
      task({ id: 1, projectId: 30, projectName: 'Site' }),
      task({ id: 2, projectId: 4, projectName: 'site' }),
      task({ id: 3, projectId: 17, projectName: 'SITE' })
    ])

    expect(groups.map((group) => group.projectId)).toEqual([4, 17, 30])
  })

  it('sorts due dates ascending inside a project', () => {
    const groups = groupActiveCollabTasksByProject([
      task({ id: 1, dueOn: APRIL_01 }),
      task({ id: 2, dueOn: MARCH_14 }),
      task({ id: 3, dueOn: MARCH_15 })
    ])

    expect(groups[0]?.tasks.map((entry) => entry.id)).toEqual([2, 3, 1])
  })

  it('sinks undated tasks below every dated one', () => {
    const groups = groupActiveCollabTasksByProject([
      task({ id: 1 }),
      task({ id: 2, dueOn: APRIL_01 }),
      task({ id: 3 }),
      task({ id: 4, dueOn: MARCH_14 })
    ])

    // Undated last, and newest-first among themselves.
    expect(groups[0]?.tasks.map((entry) => entry.id)).toEqual([4, 2, 3, 1])
  })

  it('breaks a same-due-date tie on the newest task id', () => {
    const groups = groupActiveCollabTasksByProject([
      task({ id: 5, dueOn: MARCH_14 }),
      task({ id: 90, dueOn: MARCH_14 }),
      task({ id: 41, dueOn: MARCH_14 })
    ])

    expect(groups[0]?.tasks.map((entry) => entry.id)).toEqual([90, 41, 5])
  })

  it('produces the identical order from every permutation of the same rows', () => {
    const rows = [
      task({ id: 11, projectId: 2, projectName: 'Beta', dueOn: MARCH_15 }),
      task({ id: 12, projectId: 1, projectName: 'Alpha' }),
      task({ id: 13, projectId: 2, projectName: 'Beta', dueOn: MARCH_14 }),
      task({ id: 14, projectId: 1, projectName: 'Alpha', dueOn: APRIL_01 }),
      task({ id: 15, projectId: 2, projectName: 'Beta', dueOn: MARCH_14 })
    ]
    const expected = [
      ['Alpha', [14, 12]],
      ['Beta', [15, 13, 11]]
    ]

    expect(idsByProject(groupActiveCollabTasksByProject(rows))).toEqual(expected)
    expect(idsByProject(groupActiveCollabTasksByProject(rows.toReversed()))).toEqual(expected)
    // A refetch that shuffles equal-ranked rows must still land on the same list.
    expect(
      idsByProject(groupActiveCollabTasksByProject([rows[3], rows[0], rows[4], rows[1], rows[2]]))
    ).toEqual(expected)
  })

  it('leaves the caller array untouched', () => {
    const rows = [task({ id: 1, dueOn: APRIL_01 }), task({ id: 2, dueOn: MARCH_14 })]
    groupActiveCollabTasksByProject(rows)

    expect(rows.map((entry) => entry.id)).toEqual([1, 2])
  })
})
