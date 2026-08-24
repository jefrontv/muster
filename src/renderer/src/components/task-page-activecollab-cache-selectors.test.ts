import { describe, expect, it } from 'vitest'

import { selectActiveCollabAssignedTasks } from './task-page-activecollab-cache-selectors'
import type { CacheEntry } from '@/store/slices/github'
import type { ActiveCollabTaskPageRows } from '@/store/slices/activecollab-task-patch'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'

const PREFIX = 'local#0'

function task(id: number): ActiveCollabTask {
  return {
    id,
    projectId: 7,
    projectName: 'Muster',
    taskNumber: id,
    name: `Task ${id}`,
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
    urlPath: `/projects/7/tasks/${id}`,
    taskListId: null,
    isHiddenFromClients: false,
    isImportant: false,
    estimate: null,
    jobTypeId: null,
    openSubtaskCount: null,
    totalSubtaskCount: null
  }
}

function page(
  pageNumber: number,
  taskIds: number[],
  hasMore = false,
  totalItems: number | null = null
): ActiveCollabTaskPageRows {
  return { tasks: taskIds.map(task), hasMore, totalItems, page: pageNumber }
}

function cache(
  entries: [string, ActiveCollabTaskPageRows | null][]
): Record<string, CacheEntry<ActiveCollabTaskPageRows>> {
  return Object.fromEntries(entries.map(([key, data]) => [key, { data, fetchedAt: 1 }]))
}

function ids(rows: readonly ActiveCollabTask[]): number[] {
  return rows.map((row) => row.id)
}

describe('ActiveCollab assigned-task cache selector', () => {
  it('reports nothing loaded when the scope holds no page', () => {
    expect(selectActiveCollabAssignedTasks({}, PREFIX, 3)).toEqual({
      tasks: [],
      hasMore: false,
      totalItems: null,
      loadedPages: 0
    })
  })

  it('concatenates contiguous pages in order and carries the last page paging flag', () => {
    const rows = selectActiveCollabAssignedTasks(
      cache([
        [`${PREFIX}::tasks::assigned::2`, page(2, [3, 4], false, 4)],
        [`${PREFIX}::tasks::assigned::1`, page(1, [1, 2], true, 4)]
      ]),
      PREFIX,
      2
    )
    expect(ids(rows.tasks)).toEqual([1, 2, 3, 4])
    expect(rows).toMatchObject({ hasMore: false, totalItems: 4, loadedPages: 2 })
  })

  it('stops at the first gap so a later page cannot splice in out of order', () => {
    const rows = selectActiveCollabAssignedTasks(
      cache([
        [`${PREFIX}::tasks::assigned::1`, page(1, [1], true)],
        [`${PREFIX}::tasks::assigned::3`, page(3, [9], false)]
      ]),
      PREFIX,
      3
    )
    expect(ids(rows.tasks)).toEqual([1])
    expect(rows.loadedPages).toBe(1)
    expect(rows.hasMore).toBe(true)
  })

  it('ignores pages the caller has not requested yet', () => {
    const rows = selectActiveCollabAssignedTasks(
      cache([
        [`${PREFIX}::tasks::assigned::1`, page(1, [1], true)],
        [`${PREFIX}::tasks::assigned::2`, page(2, [2], false)]
      ]),
      PREFIX,
      1
    )
    expect(ids(rows.tasks)).toEqual([1])
    expect(rows.loadedPages).toBe(1)
  })

  it('drops rows belonging to another runtime scope', () => {
    const rows = selectActiveCollabAssignedTasks(
      cache([
        [`${PREFIX}::tasks::assigned::1`, page(1, [1])],
        ['runtime:remote#0::tasks::assigned::1', page(1, [99])]
      ]),
      PREFIX,
      1
    )
    expect(ids(rows.tasks)).toEqual([1])
  })

  it('deduplicates a row the server repeats across pages as the list shifts', () => {
    const rows = selectActiveCollabAssignedTasks(
      cache([
        [`${PREFIX}::tasks::assigned::1`, page(1, [1, 2])],
        [`${PREFIX}::tasks::assigned::2`, page(2, [2, 3])]
      ]),
      PREFIX,
      2
    )
    expect(ids(rows.tasks)).toEqual([1, 2, 3])
  })

  it('treats an evicted entry with null data as a gap', () => {
    const rows = selectActiveCollabAssignedTasks(
      cache([[`${PREFIX}::tasks::assigned::1`, null]]),
      PREFIX,
      1
    )
    expect(rows.loadedPages).toBe(0)
  })

  it('keeps the first reported total when a later page omits the header', () => {
    const rows = selectActiveCollabAssignedTasks(
      cache([
        [`${PREFIX}::tasks::assigned::1`, page(1, [1], true, 120)],
        [`${PREFIX}::tasks::assigned::2`, page(2, [2], false, null)]
      ]),
      PREFIX,
      2
    )
    expect(rows.totalItems).toBe(120)
  })
})
