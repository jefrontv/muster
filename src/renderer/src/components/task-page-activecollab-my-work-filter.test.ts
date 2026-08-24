import { describe, expect, it } from 'vitest'

import {
  EMPTY_ACTIVECOLLAB_MY_WORK_FILTER,
  filterActiveCollabTasks,
  isActiveCollabMyWorkFilterActive,
  type ActiveCollabMyWorkFilter
} from './task-page-activecollab-my-work-filter'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'

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
    isHiddenFromClients: false,
    isImportant: false,
    estimate: null,
    jobTypeId: null,
    openSubtaskCount: null,
    totalSubtaskCount: null,
    ...overrides
  }
}

function ids(tasks: readonly ActiveCollabTask[]): number[] {
  return tasks.map((entry) => entry.id)
}

function filter(overrides: Partial<ActiveCollabMyWorkFilter> = {}): ActiveCollabMyWorkFilter {
  return { ...EMPTY_ACTIVECOLLAB_MY_WORK_FILTER, ...overrides }
}

describe('isActiveCollabMyWorkFilterActive', () => {
  it('is false only when nothing is set', () => {
    expect(isActiveCollabMyWorkFilterActive(EMPTY_ACTIVECOLLAB_MY_WORK_FILTER)).toBe(false)
    expect(isActiveCollabMyWorkFilterActive(filter({ text: '   ' }))).toBe(false)
    expect(isActiveCollabMyWorkFilterActive(filter({ text: 'ship' }))).toBe(true)
    expect(isActiveCollabMyWorkFilterActive(filter({ labelNames: ['docs'] }))).toBe(true)
    expect(isActiveCollabMyWorkFilterActive(filter({ projectIds: [10] }))).toBe(true)
  })
})

describe('filterActiveCollabTasks text', () => {
  it('matches the task name case-insensitively as a substring', () => {
    const rows = [
      task({ id: 1, name: 'Ship the onboarding flow' }),
      task({ id: 2, name: 'Fix login' })
    ]
    expect(ids(filterActiveCollabTasks(rows, filter({ text: 'ONBOARD' })))).toEqual([1])
    expect(ids(filterActiveCollabTasks(rows, filter({ text: 'ship' })))).toEqual([1])
  })

  it('matches the task number with or without #, and a bare prefix', () => {
    const rows = [
      task({ id: 1, taskNumber: 63, name: 'Ship' }),
      task({ id: 2, taskNumber: 630, name: 'Fix' }),
      task({ id: 3, taskNumber: 6, name: 'Draft' })
    ]
    expect(ids(filterActiveCollabTasks(rows, filter({ text: '#63' })))).toEqual([1, 2])
    expect(ids(filterActiveCollabTasks(rows, filter({ text: '63' })))).toEqual([1, 2])
    expect(ids(filterActiveCollabTasks(rows, filter({ text: '6' })))).toEqual([1, 2, 3])
    // Prefix, not substring: '3' must not find 63.
    expect(ids(filterActiveCollabTasks(rows, filter({ text: '3' })))).toEqual([])
  })
})

describe('filterActiveCollabTasks labels and projects', () => {
  it('keeps a task when any selected label is present (OR within)', () => {
    const rows = [
      task({ id: 1, labels: [{ id: 1, name: 'docs', color: null }] }),
      task({ id: 2, labels: [{ id: 2, name: 'backend', color: null }] }),
      task({
        id: 3,
        labels: [
          { id: 1, name: 'docs', color: null },
          { id: 2, name: 'backend', color: null }
        ]
      }),
      task({ id: 4 })
    ]
    expect(ids(filterActiveCollabTasks(rows, filter({ labelNames: ['docs'] })))).toEqual([1, 3])
    expect(ids(filterActiveCollabTasks(rows, filter({ labelNames: ['docs', 'backend'] })))).toEqual(
      [1, 2, 3]
    )
  })

  it('ANDs the project set against the label set', () => {
    const rows = [
      task({ id: 1, projectId: 10, labels: [{ id: 1, name: 'docs', color: null }] }),
      task({ id: 2, projectId: 20, labels: [{ id: 1, name: 'docs', color: null }] }),
      task({ id: 3, projectId: 10 })
    ]
    expect(ids(filterActiveCollabTasks(rows, filter({ projectIds: [10] })))).toEqual([1, 3])
    expect(
      ids(filterActiveCollabTasks(rows, filter({ projectIds: [10], labelNames: ['docs'] })))
    ).toEqual([1])
  })
})

describe('filterActiveCollabTasks combination and identity', () => {
  it('combines every axis with AND semantics', () => {
    const rows = [
      task({
        id: 1,
        name: 'Ship onboarding',
        projectId: 10,
        labels: [{ id: 1, name: 'docs', color: null }]
      }),
      task({
        id: 2,
        name: 'Release notes',
        projectId: 10,
        labels: [{ id: 1, name: 'docs', color: null }]
      }),
      task({
        id: 3,
        name: 'Ship docs',
        projectId: 20,
        labels: [{ id: 1, name: 'docs', color: null }]
      }),
      task({ id: 4, name: 'Ship docs', projectId: 10 })
    ]
    expect(
      ids(
        filterActiveCollabTasks(
          rows,
          filter({ text: 'ship', projectIds: [10], labelNames: ['docs'] })
        )
      )
    ).toEqual([1])
  })

  it('returns the same array reference when the filter is inactive', () => {
    const rows = [task({ id: 1 })]
    expect(filterActiveCollabTasks(rows, EMPTY_ACTIVECOLLAB_MY_WORK_FILTER)).toBe(rows)
    expect(filterActiveCollabTasks(rows, filter({ text: '   ' }))).toBe(rows)
  })
})
