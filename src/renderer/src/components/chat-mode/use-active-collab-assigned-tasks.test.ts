// The due-bucket helpers behind the chat sidebar badge and hero shortcuts. All boundaries are
// LOCAL-day boundaries (the team runs AEST), so every fixture is built with the local-time Date
// constructor — an epoch literal would encode the author's timezone into the test.

import { describe, expect, it } from 'vitest'
import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import {
  isDueToday,
  isOverdue,
  urgentActiveCollabTasks
} from './use-active-collab-assigned-tasks'

const NOON = new Date(2026, 7, 14, 12, 0, 0).getTime()

function task(overrides: Partial<ActiveCollabTask> & { id: number }): ActiveCollabTask {
  return {
    projectId: 3790,
    projectName: 'Muster',
    taskNumber: 12,
    name: 'Fix the header',
    bodyHtml: '',
    isCompleted: false,
    startOn: null,
    dueOn: null,
    createdOn: null,
    updatedOn: null,
    assigneeId: 407,
    assigneeName: 'Jake Varrese',
    createdById: null,
    createdByName: null,
    labels: [],
    commentCount: 0,
    urlPath: `/projects/3790/tasks/${overrides.id}`,
    taskListId: null,
    ...overrides
  }
}

describe('isOverdue', () => {
  it('is true only for a due date before the start of the local day', () => {
    const yesterday = new Date(2026, 7, 13, 17, 0, 0).getTime()
    expect(isOverdue(task({ id: 1, dueOn: yesterday }), NOON)).toBe(true)
  })

  it('is false for a task due earlier TODAY — that is due, not overdue', () => {
    const thisMorning = new Date(2026, 7, 14, 9, 0, 0).getTime()
    expect(isOverdue(task({ id: 1, dueOn: thisMorning }), NOON)).toBe(false)
  })

  it('is false for completed tasks and tasks with no due date', () => {
    const yesterday = new Date(2026, 7, 13, 12, 0, 0).getTime()
    expect(isOverdue(task({ id: 1, dueOn: yesterday, isCompleted: true }), NOON)).toBe(false)
    expect(isOverdue(task({ id: 2 }), NOON)).toBe(false)
  })
})

describe('isDueToday', () => {
  it('covers the whole local day, midnight to midnight', () => {
    const startOfDay = new Date(2026, 7, 14, 0, 0, 0).getTime()
    const endOfDay = new Date(2026, 7, 14, 23, 59, 59).getTime()
    expect(isDueToday(task({ id: 1, dueOn: startOfDay }), NOON)).toBe(true)
    expect(isDueToday(task({ id: 2, dueOn: endOfDay }), NOON)).toBe(true)
  })

  it('excludes tomorrow, yesterday, completed, and undated', () => {
    expect(isDueToday(task({ id: 1, dueOn: new Date(2026, 7, 15, 0, 0, 0).getTime() }), NOON)).toBe(
      false
    )
    expect(
      isDueToday(task({ id: 2, dueOn: new Date(2026, 7, 13, 23, 59, 59).getTime() }), NOON)
    ).toBe(false)
    expect(isDueToday(task({ id: 3, dueOn: NOON, isCompleted: true }), NOON)).toBe(false)
    expect(isDueToday(task({ id: 4 }), NOON)).toBe(false)
  })

  it('a task that was due today is overdue after midnight ticks over', () => {
    const dueToday = new Date(2026, 7, 14, 10, 0, 0).getTime()
    const tomorrowNoon = new Date(2026, 7, 15, 12, 0, 0).getTime()
    expect(isDueToday(task({ id: 1, dueOn: dueToday }), NOON)).toBe(true)
    expect(isDueToday(task({ id: 1, dueOn: dueToday }), tomorrowNoon)).toBe(false)
    expect(isOverdue(task({ id: 1, dueOn: dueToday }), tomorrowNoon)).toBe(true)
  })
})

describe('urgentActiveCollabTasks', () => {
  it('orders overdue first, then by nearest due date, and drops completed', () => {
    const overdue = task({ id: 1, dueOn: new Date(2026, 7, 12, 9, 0, 0).getTime() })
    const dueToday = task({ id: 2, dueOn: new Date(2026, 7, 14, 9, 0, 0).getTime() })
    const dueLater = task({ id: 3, dueOn: new Date(2026, 7, 20, 9, 0, 0).getTime() })
    const undated = task({ id: 4 })
    const done = task({ id: 5, dueOn: overdue.dueOn, isCompleted: true })

    const ordered = urgentActiveCollabTasks([undated, dueLater, done, dueToday, overdue], NOON)

    expect(ordered.map((entry) => entry.id)).toEqual([1, 2, 3, 4])
  })
})
