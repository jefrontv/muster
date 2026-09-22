import { describe, expect, it } from 'vitest'
import {
  groupByTaskList,
  myOpenTasks,
  UNGROUPED_TASK_LIST_NAME
} from './tasks-panel-projection'
import type {
  ActiveCollabProjectTasks,
  ActiveCollabTask
} from '../../../../shared/activecollab-types'

const ME = 9

function task(overrides: Partial<ActiveCollabTask> = {}): ActiveCollabTask {
  return {
    id: 1,
    projectId: 42,
    projectName: 'Acme Website',
    taskNumber: 1,
    name: 'A task',
    bodyHtml: '',
    isCompleted: false,
    startOn: null,
    dueOn: null,
    createdOn: null,
    updatedOn: null,
    taskListId: 100,
    assigneeId: ME,
    assigneeName: 'Jake',
    createdById: null,
    createdByName: null,
    labels: [],
    commentCount: 0,
    ...overrides
  } as ActiveCollabTask
}

function project(tasks: ActiveCollabTask[], lists = [{ id: 100, name: 'Backlog' }]): ActiveCollabProjectTasks {
  return { projectId: 42, tasks, taskLists: lists }
}

describe('myOpenTasks', () => {
  it('answers nothing without a connected user', () => {
    expect(myOpenTasks(project([task()]), null)).toEqual([])
  })

  it('answers nothing when the project has not loaded', () => {
    expect(myOpenTasks(null, ME)).toEqual([])
  })

  it('keeps only my tasks', () => {
    const mine = myOpenTasks(project([task({ id: 1 }), task({ id: 2, assigneeId: 77 })]), ME)
    expect(mine.map((entry) => entry.id)).toEqual([1])
  })

  it('leaves out an unassigned task', () => {
    expect(myOpenTasks(project([task({ assigneeId: null })]), ME)).toEqual([])
  })

  it('leaves out a completed task of mine', () => {
    expect(myOpenTasks(project([task({ isCompleted: true })]), ME)).toEqual([])
  })
})

describe('groupByTaskList', () => {
  it('groups under the list name', () => {
    const groups = groupByTaskList([task()], [{ id: 100, name: 'Backlog' }])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ taskListId: 100, name: 'Backlog' })
  })

  // The order in ActiveCollab is one a person arranged, so it carries intent that sorting
  // alphabetically would throw away.
  it('keeps the order ActiveCollab gave the lists', () => {
    const groups = groupByTaskList(
      [task({ id: 1, taskListId: 200 }), task({ id: 2, taskListId: 100 })],
      [
        { id: 200, name: 'Zebra' },
        { id: 100, name: 'Alpha' }
      ]
    )
    expect(groups.map((group) => group.name)).toEqual(['Zebra', 'Alpha'])
  })

  it('drops a list with none of my tasks, since an empty header says nothing', () => {
    const groups = groupByTaskList(
      [task({ taskListId: 100 })],
      [
        { id: 100, name: 'Backlog' },
        { id: 200, name: 'Empty' }
      ]
    )
    expect(groups.map((group) => group.name)).toEqual(['Backlog'])
  })

  it('collects tasks in no list under a named group rather than dropping them', () => {
    const groups = groupByTaskList([task({ taskListId: null })], [{ id: 100, name: 'Backlog' }])
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe(UNGROUPED_TASK_LIST_NAME)
  })

  it('keeps a task whose list the response never named', () => {
    const groups = groupByTaskList([task({ taskListId: 999 })], [{ id: 100, name: 'Backlog' }])
    expect(groups[0].tasks).toHaveLength(1)
  })

  it('puts the unnamed group last', () => {
    const groups = groupByTaskList(
      [task({ id: 1, taskListId: null }), task({ id: 2, taskListId: 100 })],
      [{ id: 100, name: 'Backlog' }]
    )
    expect(groups.map((group) => group.name)).toEqual(['Backlog', UNGROUPED_TASK_LIST_NAME])
  })

  it('sorts within a group by due date, soonest first', () => {
    const groups = groupByTaskList(
      [task({ id: 1, dueOn: 200 }), task({ id: 2, dueOn: 100 })],
      [{ id: 100, name: 'Backlog' }]
    )
    expect(groups[0].tasks.map((entry) => entry.id)).toEqual([2, 1])
  })

  it('sorts undated tasks after dated ones inside a group', () => {
    const groups = groupByTaskList(
      [task({ id: 1, dueOn: null }), task({ id: 2, dueOn: 5_000 })],
      [{ id: 100, name: 'Backlog' }]
    )
    expect(groups[0].tasks.map((entry) => entry.id)).toEqual([2, 1])
  })

  it('falls back to the newest task number when neither is dated', () => {
    const groups = groupByTaskList(
      [task({ id: 1, taskNumber: 5 }), task({ id: 2, taskNumber: 9 })],
      [{ id: 100, name: 'Backlog' }]
    )
    expect(groups[0].tasks.map((entry) => entry.id)).toEqual([2, 1])
  })

  it('answers no groups for no tasks', () => {
    expect(groupByTaskList([], [{ id: 100, name: 'Backlog' }])).toEqual([])
  })
})
