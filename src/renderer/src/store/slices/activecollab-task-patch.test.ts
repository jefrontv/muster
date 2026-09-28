import { describe, expect, it } from 'vitest'
import type {
  ActiveCollabTask,
  ActiveCollabTaskDetail
} from '../../../../shared/activecollab-types'
import { findCachedActiveCollabTask, type TaskCaches } from './activecollab-task-patch'

const PREFIX = 'local#0'

function task(id: number, overrides: Partial<ActiveCollabTask> = {}): ActiveCollabTask {
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
    totalSubtaskCount: null,
    ...overrides
  }
}

function caches(args: {
  pages?: Record<string, ActiveCollabTask[]>
  details?: Record<string, ActiveCollabTask>
}): TaskCaches {
  const activeCollabTaskPageCache: TaskCaches['activeCollabTaskPageCache'] = {}
  for (const [key, tasks] of Object.entries(args.pages ?? {})) {
    activeCollabTaskPageCache[key] = {
      data: { tasks, hasMore: false, totalItems: null, page: 1 },
      fetchedAt: 0
    }
  }
  const activeCollabTaskDetailCache: TaskCaches['activeCollabTaskDetailCache'] = {}
  for (const [key, row] of Object.entries(args.details ?? {})) {
    activeCollabTaskDetailCache[key] = {
      data: { task: row } as ActiveCollabTaskDetail,
      fetchedAt: 0
    }
  }
  return { activeCollabTaskPageCache, activeCollabTaskDetailCache }
}

describe('findCachedActiveCollabTask', () => {
  it('prefers the detail cache over a list row for the same task', () => {
    const detailRow = task(3, { name: 'From detail' })
    const state = caches({
      pages: { [`${PREFIX}::tasks::assigned::1`]: [task(3, { name: 'From list' })] },
      details: { [`${PREFIX}::detail::7::3`]: detailRow }
    })
    expect(findCachedActiveCollabTask(state, 3, PREFIX)).toBe(detailRow)
  })

  it('finds a stale or completed row on an assigned page', () => {
    const done = task(5, { isCompleted: true })
    const state = caches({ pages: { [`${PREFIX}::tasks::assigned::2`]: [task(4), done] } })
    expect(findCachedActiveCollabTask(state, 5, PREFIX)).toBe(done)
  })

  it("never serves another runtime environment's rows", () => {
    const state = caches({
      pages: { ['remote#1::tasks::assigned::1']: [task(3)] },
      details: { ['remote#1::detail::7::3']: task(3) }
    })
    expect(findCachedActiveCollabTask(state, 3, PREFIX)).toBeNull()
  })

  it('returns null when no cache holds the task', () => {
    const state = caches({ pages: { [`${PREFIX}::tasks::assigned::1`]: [task(1)] } })
    expect(findCachedActiveCollabTask(state, 9, PREFIX)).toBeNull()
  })
})
