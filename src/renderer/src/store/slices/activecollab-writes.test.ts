import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import type { CacheEntry } from './github'
import type {
  ActiveCollabComment,
  ActiveCollabSubtask,
  ActiveCollabTask,
  ActiveCollabTaskDetail
} from '../../../../shared/activecollab-types'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { createActiveCollabSlice } from './activecollab'
import type { ActiveCollabTaskPageRows } from './activecollab-task-patch'

const status = vi.fn()
const connect = vi.fn()
const disconnect = vi.fn()
const listAssignedTasks = vi.fn()
const listProjects = vi.fn()
const getTaskDetail = vi.fn()
const updateTask = vi.fn()
const completeTask = vi.fn()
const reopenTask = vi.fn()
const postComment = vi.fn()
const listLabels = vi.fn()
const listUsers = vi.fn()
const listProjectMembers = vi.fn()
const createSubtask = vi.fn()
const updateSubtask = vi.fn()
const completeSubtask = vi.fn()
const reopenSubtask = vi.fn()
const updateComment = vi.fn()
const deleteComment = vi.fn()
const setTaskSubscription = vi.fn()

vi.mock('@/runtime/runtime-activecollab-client', () => ({
  activeCollabStatus: (...args: unknown[]) => status(...args),
  activeCollabConnect: (...args: unknown[]) => connect(...args),
  activeCollabDisconnect: (...args: unknown[]) => disconnect(...args),
  activeCollabListAssignedTasks: (...args: unknown[]) => listAssignedTasks(...args),
  activeCollabListProjects: (...args: unknown[]) => listProjects(...args),
  activeCollabGetTaskDetail: (...args: unknown[]) => getTaskDetail(...args),
  activeCollabUpdateTask: (...args: unknown[]) => updateTask(...args),
  activeCollabCompleteTask: (...args: unknown[]) => completeTask(...args),
  activeCollabReopenTask: (...args: unknown[]) => reopenTask(...args),
  activeCollabPostComment: (...args: unknown[]) => postComment(...args),
  activeCollabListLabels: (...args: unknown[]) => listLabels(...args),
  activeCollabListUsers: (...args: unknown[]) => listUsers(...args),
  activeCollabListProjectMembers: (...args: unknown[]) => listProjectMembers(...args),
  activeCollabCreateSubtask: (...args: unknown[]) => createSubtask(...args),
  activeCollabUpdateSubtask: (...args: unknown[]) => updateSubtask(...args),
  activeCollabCompleteSubtask: (...args: unknown[]) => completeSubtask(...args),
  activeCollabReopenSubtask: (...args: unknown[]) => reopenSubtask(...args),
  activeCollabUpdateComment: (...args: unknown[]) => updateComment(...args),
  activeCollabDeleteComment: (...args: unknown[]) => deleteComment(...args),
  activeCollabSetTaskSubscription: (...args: unknown[]) => setTaskSubscription(...args)
}))

function createTestStore() {
  return create<AppState>()(
    (...a) =>
      ({
        settings: null,
        ...createActiveCollabSlice(...a)
      }) as AppState
  )
}

function task(id: number, overrides: Partial<ActiveCollabTask> = {}): ActiveCollabTask {
  return {
    id,
    projectId: 12,
    projectName: 'Alpha',
    taskNumber: id,
    name: `Task ${id}`,
    bodyHtml: '',
    isCompleted: false,
    startOn: null,
    dueOn: null,
    createdOn: null,
    updatedOn: null,
    assigneeId: 7,
    assigneeName: 'Jake',
    createdById: null,
    createdByName: null,
    labels: [],
    commentCount: 0,
    urlPath: `/projects/12/tasks/${id}`,
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

function subtask(id: number, overrides: Partial<ActiveCollabSubtask> = {}): ActiveCollabSubtask {
  return {
    id,
    taskId: 1,
    name: `Subtask ${id}`,
    isCompleted: false,
    assigneeId: null,
    assigneeName: null,
    dueOn: null,
    createdOn: null,
    ...overrides
  }
}

function comment(id: number): ActiveCollabComment {
  return {
    id,
    bodyHtml: '<p>hi</p>',
    bodyPlainText: 'hi',
    createdOn: 1,
    createdById: 7,
    createdByName: 'Jake',
    attachments: []
  }
}

function pageEntry(tasks: ActiveCollabTask[]): CacheEntry<ActiveCollabTaskPageRows> {
  return {
    data: { tasks, hasMore: false, totalItems: tasks.length, page: 1 },
    fetchedAt: Date.now()
  }
}

function detailEntry(
  detail: Partial<ActiveCollabTaskDetail> & { task: ActiveCollabTask }
): CacheEntry<ActiveCollabTaskDetail> {
  return {
    data: {
      attachments: [],
      comments: [],
      subtasks: [],
      subscriberIds: [],
      trackedTime: null,
      ...detail
    },
    fetchedAt: Date.now()
  }
}

const implicitPageKey = (): string => `${getProviderRuntimeContextKey(null)}::tasks::assigned::1`
const implicitDetailKey = (taskId: number): string =>
  `${getProviderRuntimeContextKey(null)}::detail::12::${taskId}`

beforeEach(() => {
  vi.clearAllMocks()
  status.mockResolvedValue({
    ok: true,
    value: { configured: true, connection: null, reason: '' }
  })
})

describe('activecollab subtask writes', () => {
  it('appends a created subtask optimistically and reconciles the real id on success', async () => {
    const store = createTestStore()
    const key = implicitDetailKey(1)
    store.setState({
      activeCollabTaskDetailCache: {
        [key]: detailEntry({
          task: task(1, { openSubtaskCount: 1, totalSubtaskCount: 1 }),
          subtasks: [subtask(10)]
        })
      }
    })
    createSubtask.mockResolvedValue({ ok: true, value: subtask(11, { name: 'New' }) })

    const pending = store
      .getState()
      .createActiveCollabSubtask({ projectId: 12, taskId: 1, name: 'New' })

    const optimistic = store.getState().activeCollabTaskDetailCache[key]
    expect(optimistic?.data?.subtasks).toHaveLength(2)
    expect(optimistic?.data?.subtasks[1]?.name).toBe('New')
    expect(optimistic?.data?.task.openSubtaskCount).toBe(2)
    expect(optimistic?.data?.task.totalSubtaskCount).toBe(2)

    await pending
    const settled = store.getState().activeCollabTaskDetailCache[key]
    expect(settled?.data?.subtasks.map((row) => row.id)).toEqual([10, 11])
    expect(settled?.data?.task.openSubtaskCount).toBe(2)
    expect(store.getState().activeCollabLastError).toBeNull()
  })

  it('rolls back an optimistic subtask create and its count bump on failure', async () => {
    const store = createTestStore()
    const key = implicitDetailKey(1)
    store.setState({
      activeCollabTaskDetailCache: {
        [key]: detailEntry({ task: task(1, { openSubtaskCount: 0, totalSubtaskCount: 0 }) })
      }
    })
    createSubtask.mockResolvedValue({ ok: false, kind: 'api', error: 'boom', status: 500 })

    const result = await store
      .getState()
      .createActiveCollabSubtask({ projectId: 12, taskId: 1, name: 'New' })

    expect(result.ok).toBe(false)
    const settled = store.getState().activeCollabTaskDetailCache[key]
    expect(settled?.data?.subtasks).toHaveLength(0)
    expect(settled?.data?.task.openSubtaskCount).toBe(0)
    expect(settled?.data?.task.totalSubtaskCount).toBe(0)
    expect(store.getState().activeCollabLastError).toBe('boom')
  })

  it('applies a subtask edit optimistically and reconciles the returned row', async () => {
    const store = createTestStore()
    const key = implicitDetailKey(1)
    store.setState({
      activeCollabTaskDetailCache: {
        [key]: detailEntry({ task: task(1), subtasks: [subtask(10, { name: 'Old' })] })
      }
    })
    updateSubtask.mockResolvedValue({
      ok: true,
      value: subtask(10, { name: 'New', assigneeId: 5, assigneeName: 'Jess' })
    })

    await store.getState().updateActiveCollabSubtask({
      projectId: 12,
      taskId: 1,
      subtaskId: 10,
      update: { name: 'New', assigneeId: 5 }
    })

    const settled = store.getState().activeCollabTaskDetailCache[key]?.data?.subtasks[0]
    expect(settled?.name).toBe('New')
    expect(settled?.assigneeId).toBe(5)
    expect(settled?.assigneeName).toBe('Jess')
  })

  it('toggles completion optimistically and moves the open count on the detail and the page row', async () => {
    const store = createTestStore()
    const key = implicitDetailKey(1)
    const pageKey = implicitPageKey()
    store.setState({
      activeCollabTaskDetailCache: {
        [key]: detailEntry({
          task: task(1, { openSubtaskCount: 2, totalSubtaskCount: 2 }),
          subtasks: [subtask(10), subtask(11)]
        })
      },
      activeCollabTaskPageCache: {
        [pageKey]: pageEntry([task(1, { openSubtaskCount: 2, totalSubtaskCount: 2 })])
      }
    })
    completeSubtask.mockResolvedValue({ ok: true, value: subtask(10, { isCompleted: true }) })

    await store
      .getState()
      .setActiveCollabSubtaskCompletion({ taskId: 1, subtaskId: 10, isCompleted: true })

    const detail = store.getState().activeCollabTaskDetailCache[key]
    expect(detail?.data?.subtasks.find((row) => row.id === 10)?.isCompleted).toBe(true)
    expect(detail?.data?.task.openSubtaskCount).toBe(1)
    expect(detail?.data?.task.totalSubtaskCount).toBe(2)
    expect(
      store.getState().activeCollabTaskPageCache[pageKey]?.data?.tasks[0]?.openSubtaskCount
    ).toBe(1)
  })

  it('rolls back a completion toggle on failure', async () => {
    const store = createTestStore()
    const key = implicitDetailKey(1)
    store.setState({
      activeCollabTaskDetailCache: {
        [key]: detailEntry({
          task: task(1, { openSubtaskCount: 1, totalSubtaskCount: 1 }),
          subtasks: [subtask(10)]
        })
      }
    })
    completeSubtask.mockResolvedValue({ ok: false, kind: 'api', error: 'nope', status: 500 })

    const result = await store
      .getState()
      .setActiveCollabSubtaskCompletion({ taskId: 1, subtaskId: 10, isCompleted: true })

    expect(result.ok).toBe(false)
    const detail = store.getState().activeCollabTaskDetailCache[key]
    expect(detail?.data?.subtasks[0]?.isCompleted).toBe(false)
    expect(detail?.data?.task.openSubtaskCount).toBe(1)
  })
})

describe('activecollab comment writes', () => {
  it('edits a comment body optimistically and reconciles the returned row', async () => {
    const store = createTestStore()
    const key = implicitDetailKey(1)
    store.setState({
      activeCollabTaskDetailCache: {
        [key]: detailEntry({ task: task(1), comments: [comment(9)] })
      }
    })
    updateComment.mockResolvedValue({
      ok: true,
      value: { ...comment(9), bodyHtml: '<p>new</p>', bodyPlainText: 'new' }
    })

    await store
      .getState()
      .updateActiveCollabComment({ taskId: 1, commentId: 9, bodyHtml: '<p>new</p>' })

    const settled = store.getState().activeCollabTaskDetailCache[key]?.data?.comments[0]
    expect(settled?.bodyHtml).toBe('<p>new</p>')
    expect(settled?.bodyPlainText).toBe('new')
  })

  it('removes a deleted comment and decrements the badge on the detail and the page row', async () => {
    const store = createTestStore()
    const key = implicitDetailKey(1)
    const pageKey = implicitPageKey()
    store.setState({
      activeCollabTaskDetailCache: {
        [key]: detailEntry({
          task: task(1, { commentCount: 2 }),
          comments: [comment(9), comment(10)]
        })
      },
      activeCollabTaskPageCache: {
        [pageKey]: pageEntry([task(1, { commentCount: 2 })])
      }
    })
    deleteComment.mockResolvedValue({ ok: true, value: null })

    await store.getState().deleteActiveCollabComment({ taskId: 1, commentId: 9 })

    const detail = store.getState().activeCollabTaskDetailCache[key]
    expect(detail?.data?.comments.map((row) => row.id)).toEqual([10])
    expect(detail?.data?.task.commentCount).toBe(1)
    expect(store.getState().activeCollabTaskPageCache[pageKey]?.data?.tasks[0]?.commentCount).toBe(
      1
    )
  })

  it('rolls back a comment deletion on failure', async () => {
    const store = createTestStore()
    const key = implicitDetailKey(1)
    store.setState({
      activeCollabTaskDetailCache: {
        [key]: detailEntry({
          task: task(1, { commentCount: 2 }),
          comments: [comment(9), comment(10)]
        })
      }
    })
    deleteComment.mockResolvedValue({ ok: false, kind: 'api', error: 'gone', status: 500 })

    const result = await store.getState().deleteActiveCollabComment({ taskId: 1, commentId: 9 })

    expect(result.ok).toBe(false)
    const detail = store.getState().activeCollabTaskDetailCache[key]
    expect(detail?.data?.comments.map((row) => row.id)).toEqual([9, 10])
    expect(detail?.data?.task.commentCount).toBe(2)
  })
})

describe('activecollab subscription writes', () => {
  it('adds and removes a subscriber in place', async () => {
    const store = createTestStore()
    const key = implicitDetailKey(1)
    store.setState({
      activeCollabTaskDetailCache: {
        [key]: detailEntry({ task: task(1), subscriberIds: [7] })
      }
    })
    setTaskSubscription.mockResolvedValue({ ok: true, value: null })

    await store
      .getState()
      .setActiveCollabTaskSubscription({ taskId: 1, userId: 9, subscribed: true })
    expect(store.getState().activeCollabTaskDetailCache[key]?.data?.subscriberIds).toEqual([7, 9])

    await store
      .getState()
      .setActiveCollabTaskSubscription({ taskId: 1, userId: 7, subscribed: false })
    expect(store.getState().activeCollabTaskDetailCache[key]?.data?.subscriberIds).toEqual([9])
  })

  it('rolls back a subscriber change on failure', async () => {
    const store = createTestStore()
    const key = implicitDetailKey(1)
    store.setState({
      activeCollabTaskDetailCache: {
        [key]: detailEntry({ task: task(1), subscriberIds: [7] })
      }
    })
    setTaskSubscription.mockResolvedValue({ ok: false, kind: 'api', error: 'denied', status: 403 })

    const result = await store
      .getState()
      .setActiveCollabTaskSubscription({ taskId: 1, userId: 9, subscribed: true })

    expect(result.ok).toBe(false)
    expect(store.getState().activeCollabTaskDetailCache[key]?.data?.subscriberIds).toEqual([7])
  })
})
