import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import type { CacheEntry } from './github'
import type {
  ActiveCollabComment,
  ActiveCollabConnection,
  ActiveCollabConnectionStatus,
  ActiveCollabTask,
  ActiveCollabTaskDetail,
  ActiveCollabTaskPage
} from '../../../../shared/activecollab-types'
import type { ActiveCollabResult } from '../../../../shared/activecollab-api-types'
import {
  getTaskSourceCacheScope,
  type TaskSourceContext
} from '../../../../shared/task-source-context'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { credentialDecryptionMessage } from '../../../../shared/integration-credential-errors'
import { CACHE_TTL, MAX_CACHE_ENTRIES } from './activecollab-cache'
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
  activeCollabListLabels: (...args: unknown[]) => listLabels(...args)
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
    dueOn: null,
    createdOn: null,
    updatedOn: null,
    assigneeId: 7,
    assigneeName: 'Jake',
    labels: [],
    commentCount: 0,
    urlPath: `/projects/12/tasks/${id}`,
    taskListId: null,
    ...overrides
  }
}

function page(tasks: ActiveCollabTask[], hasMore = false): ActiveCollabTaskPage {
  return { tasks, totalItems: tasks.length, hasMore }
}

function comment(id: number): ActiveCollabComment {
  return {
    id,
    bodyHtml: '<p>hi</p>',
    bodyPlainText: 'hi',
    createdOn: 1,
    createdById: 7,
    createdByName: 'Jake'
  }
}

function sourceContext(environmentId: string): TaskSourceContext {
  return {
    kind: 'task-source',
    provider: 'activecollab',
    projectId: 'logical-project',
    hostId: `runtime:${environmentId}`,
    providerIdentity: {
      provider: 'activecollab',
      instanceUrl: 'https://projects.example.com'
    }
  }
}

function unwrap<T>(result: ActiveCollabResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok result, got ${result.kind}: ${result.error}`)
  }
  return result.value
}

function pageEntry(tasks: ActiveCollabTask[]): CacheEntry<ActiveCollabTaskPageRows> {
  return {
    data: { tasks, hasMore: false, totalItems: tasks.length, page: 1 },
    fetchedAt: Date.now()
  }
}

function detailEntry(detail: ActiveCollabTaskDetail): CacheEntry<ActiveCollabTaskDetail> {
  return { data: detail, fetchedAt: Date.now() }
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

describe('createActiveCollabSlice caching', () => {
  it('serves a fresh assigned-task page from cache and refetches once it expires', async () => {
    const store = createTestStore()
    listAssignedTasks.mockResolvedValue({ ok: true, value: page([task(1)]) })

    const first = unwrap(await store.getState().listActiveCollabAssignedTasks())
    const second = unwrap(await store.getState().listActiveCollabAssignedTasks())

    expect(listAssignedTasks).toHaveBeenCalledTimes(1)
    expect(first.tasks.map((row) => row.id)).toEqual([1])
    expect(second.tasks.map((row) => row.id)).toEqual([1])
    expect(first.page).toBe(1)
    expect(first.hasMore).toBe(false)

    const entry = store.getState().activeCollabTaskPageCache[implicitPageKey()]
    store.setState({
      activeCollabTaskPageCache: {
        [implicitPageKey()]: { ...entry!, fetchedAt: Date.now() - CACHE_TTL - 1 }
      }
    })

    await store.getState().listActiveCollabAssignedTasks()
    expect(listAssignedTasks).toHaveBeenCalledTimes(2)
  })

  it('caches each page separately and reports hasMore per page', async () => {
    const store = createTestStore()
    listAssignedTasks
      .mockResolvedValueOnce({ ok: true, value: page([task(1)], true) })
      .mockResolvedValueOnce({ ok: true, value: page([task(2)], false) })

    const first = unwrap(await store.getState().listActiveCollabAssignedTasks({ page: 1 }))
    const second = unwrap(await store.getState().listActiveCollabAssignedTasks({ page: 2 }))

    expect(first.hasMore).toBe(true)
    expect(second.hasMore).toBe(false)
    expect(second.page).toBe(2)
    expect(Object.keys(store.getState().activeCollabTaskPageCache)).toHaveLength(2)
    expect(listAssignedTasks).toHaveBeenNthCalledWith(1, { page: 1 }, null)
  })

  it('refetches a cache hit when the caller forces a refresh', async () => {
    const store = createTestStore()
    listAssignedTasks.mockResolvedValue({ ok: true, value: page([task(1)]) })

    await store.getState().listActiveCollabAssignedTasks()
    await store.getState().listActiveCollabAssignedTasks(undefined, { force: true })

    expect(listAssignedTasks).toHaveBeenCalledTimes(2)
  })

  it('joins a concurrent read instead of issuing a second request', async () => {
    const store = createTestStore()
    listAssignedTasks.mockResolvedValue({ ok: true, value: page([task(1)]) })

    const [first, second] = await Promise.all([
      store.getState().listActiveCollabAssignedTasks(),
      store.getState().listActiveCollabAssignedTasks()
    ])

    expect(listAssignedTasks).toHaveBeenCalledTimes(1)
    expect(unwrap(first).tasks).toEqual(unwrap(second).tasks)
  })

  it('lands each read in its own cache and serves the second call from it', async () => {
    const store = createTestStore()
    const prefix = getProviderRuntimeContextKey(null)
    listProjects.mockResolvedValue({
      ok: true,
      value: [{ id: 12, name: 'Alpha', isCompleted: false, openTaskCount: 3 }]
    })
    listLabels.mockResolvedValue({ ok: true, value: [{ id: 4, name: 'urgent', color: '#f00' }] })
    getTaskDetail.mockResolvedValue({ ok: true, value: { task: task(1), comments: [comment(9)] } })

    await store.getState().listActiveCollabProjects()
    await store.getState().listActiveCollabLabels()
    await store.getState().fetchActiveCollabTaskDetail({ projectId: 12, taskId: 1 })
    await store.getState().listActiveCollabProjects()
    await store.getState().listActiveCollabLabels()
    await store.getState().fetchActiveCollabTaskDetail({ projectId: 12, taskId: 1 })

    const state = store.getState()
    expect(listProjects).toHaveBeenCalledTimes(1)
    expect(listLabels).toHaveBeenCalledTimes(1)
    expect(getTaskDetail).toHaveBeenCalledTimes(1)
    expect(Object.keys(state.activeCollabProjectCache)).toEqual([`${prefix}::projects`])
    expect(Object.keys(state.activeCollabLabelCache)).toEqual([`${prefix}::labels`])
    expect(Object.keys(state.activeCollabTaskDetailCache)).toEqual([implicitDetailKey(1)])
    expect(state.activeCollabProjectCache[`${prefix}::projects`]?.data?.[0]?.name).toBe('Alpha')
    expect(state.activeCollabLabelCache[`${prefix}::labels`]?.data?.[0]?.name).toBe('urgent')
  })
})

describe('createActiveCollabSlice scope isolation', () => {
  it('does not serve one runtime context rows cached by another', async () => {
    const store = createTestStore()
    listAssignedTasks
      .mockResolvedValueOnce({ ok: true, value: page([task(1, { name: 'Local task' })]) })
      .mockResolvedValueOnce({ ok: true, value: page([task(2, { name: 'Remote task' })]) })

    const local = unwrap(await store.getState().listActiveCollabAssignedTasks())
    store.setState({ settings: { activeRuntimeEnvironmentId: 'runtime-1' } as never })
    const remote = unwrap(await store.getState().listActiveCollabAssignedTasks())

    expect(listAssignedTasks).toHaveBeenCalledTimes(2)
    expect(local.tasks[0]?.name).toBe('Local task')
    expect(remote.tasks[0]?.name).toBe('Remote task')
    expect(Object.keys(store.getState().activeCollabTaskPageCache)).toHaveLength(2)
    expect(
      store.getState().activeCollabTaskPageCache[implicitPageKey()]?.data?.tasks[0]?.name
    ).toBe('Local task')
  })

  it('keeps two source contexts in separate cache scopes', async () => {
    const store = createTestStore()
    const alpha = sourceContext('env-a')
    const beta = sourceContext('env-b')
    listAssignedTasks
      .mockResolvedValueOnce({ ok: true, value: page([task(1, { name: 'Alpha task' })]) })
      .mockResolvedValueOnce({ ok: true, value: page([task(2, { name: 'Beta task' })]) })

    await store.getState().listActiveCollabAssignedTasks(undefined, { sourceContext: alpha })
    await store.getState().listActiveCollabAssignedTasks(undefined, { sourceContext: beta })

    const cache = store.getState().activeCollabTaskPageCache
    expect(listAssignedTasks).toHaveBeenCalledTimes(2)
    expect(
      cache[`${getTaskSourceCacheScope(alpha)}::tasks::assigned::1`]?.data?.tasks[0]?.name
    ).toBe('Alpha task')
    expect(
      cache[`${getTaskSourceCacheScope(beta)}::tasks::assigned::1`]?.data?.tasks[0]?.name
    ).toBe('Beta task')
    expect(listAssignedTasks).toHaveBeenNthCalledWith(1, { page: 1 }, alpha)
  })

  it('drops a read that resolves after the runtime context moved', async () => {
    const store = createTestStore()
    const pending = Promise.withResolvers<ActiveCollabResult<ActiveCollabTaskPage>>()
    listAssignedTasks.mockReturnValueOnce(pending.promise)

    const localRequest = store.getState().listActiveCollabAssignedTasks()
    const localKey = implicitPageKey()
    store.setState({ settings: { activeRuntimeEnvironmentId: 'runtime-1' } as never })

    pending.resolve({ ok: true, value: page([task(1, { name: 'Local task' })]) })
    await localRequest

    expect(store.getState().activeCollabTaskPageCache[localKey]).toBeUndefined()
  })
})

describe('createActiveCollabSlice cache eviction', () => {
  it('prunes the oldest detail entries once the cache passes MAX_CACHE_ENTRIES', async () => {
    const store = createTestStore()
    const seeded: Record<string, CacheEntry<ActiveCollabTaskDetail>> = {}
    for (let index = 0; index < MAX_CACHE_ENTRIES; index += 1) {
      seeded[`seed::detail::${index}`] = {
        data: { task: task(1_000 + index), comments: [] },
        fetchedAt: 1_000 + index
      }
    }
    store.setState({ activeCollabTaskDetailCache: seeded })
    getTaskDetail.mockResolvedValue({ ok: true, value: { task: task(1), comments: [] } })

    await store.getState().fetchActiveCollabTaskDetail({ projectId: 12, taskId: 1 })

    const cache = store.getState().activeCollabTaskDetailCache
    expect(Object.keys(cache)).toHaveLength(MAX_CACHE_ENTRIES)
    expect(cache['seed::detail::0']).toBeUndefined()
    expect(cache[`seed::detail::${MAX_CACHE_ENTRIES - 1}`]).toBeDefined()
    expect(cache[implicitDetailKey(1)]?.data?.task.id).toBe(1)
  })
})

describe('createActiveCollabSlice optimistic patch propagation', () => {
  it('patches a returned row into every cache holding the task', async () => {
    const store = createTestStore()
    const context = sourceContext('env-a')
    const scope = getTaskSourceCacheScope(context)
    store.setState({
      activeCollabTaskPageCache: {
        [`${scope}::tasks::assigned::1`]: pageEntry([task(1), task(2)]),
        [`${scope}::tasks::assigned::2`]: pageEntry([task(1)])
      },
      activeCollabTaskDetailCache: {
        [`${scope}::detail::12::1`]: detailEntry({ task: task(1), comments: [comment(9)] }),
        [`${scope}::detail::12::2`]: detailEntry({ task: task(2), comments: [] })
      }
    })
    completeTask.mockResolvedValue({ ok: true, value: task(1, { isCompleted: true }) })

    await store.getState().completeActiveCollabTask({ taskId: 1 }, { sourceContext: context })

    const state = store.getState()
    const firstPage = state.activeCollabTaskPageCache[`${scope}::tasks::assigned::1`]
    const secondPage = state.activeCollabTaskPageCache[`${scope}::tasks::assigned::2`]
    const detail = state.activeCollabTaskDetailCache[`${scope}::detail::12::1`]

    expect(firstPage?.data?.tasks[0]?.isCompleted).toBe(true)
    expect(firstPage?.data?.tasks[1]?.isCompleted).toBe(false)
    expect(secondPage?.data?.tasks[0]?.isCompleted).toBe(true)
    expect(detail?.data?.task.isCompleted).toBe(true)
    // The row is authoritative, the thread beside it is not.
    expect(detail?.data?.comments).toHaveLength(1)
    expect(detail?.fetchedAt).toBe(0)
    expect(
      state.activeCollabTaskDetailCache[`${scope}::detail::12::2`]?.data?.task.isCompleted
    ).toBe(false)
    expect(state.activeCollabLastError).toBeNull()
  })

  it('confines a scoped patch to its own source context', async () => {
    const store = createTestStore()
    const alpha = sourceContext('env-a')
    const beta = sourceContext('env-b')
    const alphaScope = getTaskSourceCacheScope(alpha)
    const betaScope = getTaskSourceCacheScope(beta)
    store.setState({
      activeCollabTaskPageCache: {
        [`${alphaScope}::tasks::assigned::1`]: pageEntry([task(1)]),
        [`${betaScope}::tasks::assigned::1`]: pageEntry([task(1)])
      }
    })
    reopenTask.mockResolvedValue({ ok: true, value: task(1, { name: 'Reopened' }) })

    await store.getState().reopenActiveCollabTask({ taskId: 1 }, { sourceContext: alpha })

    const cache = store.getState().activeCollabTaskPageCache
    expect(cache[`${alphaScope}::tasks::assigned::1`]?.data?.tasks[0]?.name).toBe('Reopened')
    expect(cache[`${betaScope}::tasks::assigned::1`]?.data?.tasks[0]?.name).toBe('Task 1')
  })

  it('reaches every scope when the write carries no source context', async () => {
    const store = createTestStore()
    const alphaScope = getTaskSourceCacheScope(sourceContext('env-a'))
    const betaScope = getTaskSourceCacheScope(sourceContext('env-b'))
    store.setState({
      activeCollabTaskPageCache: {
        [`${alphaScope}::tasks::assigned::1`]: pageEntry([task(1)]),
        [`${betaScope}::tasks::assigned::1`]: pageEntry([task(1)])
      }
    })
    updateTask.mockResolvedValue({ ok: true, value: task(1, { name: 'Renamed' }) })

    await store
      .getState()
      .updateActiveCollabTask({ projectId: 12, taskId: 1, update: { name: 'Renamed' } })

    const cache = store.getState().activeCollabTaskPageCache
    expect(cache[`${alphaScope}::tasks::assigned::1`]?.data?.tasks[0]?.name).toBe('Renamed')
    expect(cache[`${betaScope}::tasks::assigned::1`]?.data?.tasks[0]?.name).toBe('Renamed')
  })

  it('appends a posted comment to the thread and its badge', async () => {
    const store = createTestStore()
    const key = implicitDetailKey(1)
    store.setState({
      activeCollabTaskDetailCache: {
        [key]: detailEntry({ task: task(1, { commentCount: 2 }), comments: [comment(9)] })
      },
      activeCollabTaskPageCache: {
        [implicitPageKey()]: pageEntry([task(1, { commentCount: 2 })])
      }
    })
    postComment.mockResolvedValue({ ok: true, value: comment(10) })

    await store.getState().postActiveCollabComment({ taskId: 1, bodyHtml: '<p>hi</p>' })

    const detail = store.getState().activeCollabTaskDetailCache[key]
    expect(detail?.data?.comments.map((row) => row.id)).toEqual([9, 10])
    expect(detail?.data?.task.commentCount).toBe(3)
    expect(
      store.getState().activeCollabTaskPageCache[implicitPageKey()]?.data?.tasks[0]?.commentCount
    ).toBe(3)
  })
})

describe('createActiveCollabSlice null write echo', () => {
  it('treats an ok result with a null row as a refetch, not a failure or a deletion', async () => {
    const store = createTestStore()
    const pageKey = implicitPageKey()
    const detailKey = implicitDetailKey(1)
    store.setState({
      activeCollabTaskPageCache: { [pageKey]: pageEntry([task(1), task(2)]) },
      activeCollabTaskDetailCache: {
        [detailKey]: detailEntry({ task: task(1), comments: [comment(9)] })
      },
      activeCollabLastError: 'stale error'
    })
    completeTask.mockResolvedValue({ ok: true, value: null })

    const result = await store.getState().completeActiveCollabTask({ taskId: 1 })

    expect(result).toEqual({ ok: true, value: null })
    expect(store.getState().activeCollabLastError).toBeNull()

    const cachedPage = store.getState().activeCollabTaskPageCache[pageKey]
    const cachedDetail = store.getState().activeCollabTaskDetailCache[detailKey]
    expect(cachedPage?.data?.tasks.map((row) => row.id)).toEqual([1, 2])
    expect(cachedDetail?.data?.task.id).toBe(1)
    expect(cachedDetail?.data?.comments).toHaveLength(1)
    expect(cachedPage?.fetchedAt).toBe(0)
    expect(cachedDetail?.fetchedAt).toBe(0)
    expect(status).not.toHaveBeenCalled()
  })

  it('sends the next read to the network after a null echo staled the rows', async () => {
    const store = createTestStore()
    store.setState({
      activeCollabTaskPageCache: { [implicitPageKey()]: pageEntry([task(1)]) }
    })
    reopenTask.mockResolvedValue({ ok: true, value: null })
    listAssignedTasks.mockResolvedValue({
      ok: true,
      value: page([task(1, { isCompleted: false, name: 'Refetched' })])
    })

    await store.getState().reopenActiveCollabTask({ taskId: 1 })
    const refetched = unwrap(await store.getState().listActiveCollabAssignedTasks())

    expect(listAssignedTasks).toHaveBeenCalledTimes(1)
    expect(refetched.tasks[0]?.name).toBe('Refetched')
  })

  it('leaves untouched pages fresh when a null echo stales only the affected task', async () => {
    const store = createTestStore()
    const otherKey = `${getProviderRuntimeContextKey(null)}::tasks::assigned::2`
    store.setState({
      activeCollabTaskPageCache: {
        [implicitPageKey()]: pageEntry([task(1)]),
        [otherKey]: pageEntry([task(5)])
      }
    })
    completeTask.mockResolvedValue({ ok: true, value: null })

    await store.getState().completeActiveCollabTask({ taskId: 1 })

    expect(store.getState().activeCollabTaskPageCache[implicitPageKey()]?.fetchedAt).toBe(0)
    expect(store.getState().activeCollabTaskPageCache[otherKey]?.fetchedAt).toBeGreaterThan(0)
  })
})

describe('createActiveCollabSlice failures', () => {
  it('records the failure and refreshes status when the token is rejected', async () => {
    const store = createTestStore()
    listProjects.mockResolvedValue({
      ok: false,
      kind: 'auth',
      error: 'Token rejected',
      status: 401
    })

    const result = await store.getState().listActiveCollabProjects()

    expect(result.ok).toBe(false)
    expect(store.getState().activeCollabLastError).toBe('Token rejected')
    expect(status).toHaveBeenCalledTimes(1)
    expect(store.getState().activeCollabProjectCache).toEqual({})
  })

  it('refreshes status when a saved credential cannot be decrypted', async () => {
    const store = createTestStore()
    listLabels.mockResolvedValue({
      ok: false,
      kind: 'unknown',
      error: credentialDecryptionMessage('ActiveCollab'),
      status: null
    })

    await store.getState().listActiveCollabLabels()

    expect(status).toHaveBeenCalledTimes(1)
  })

  it('leaves connection status alone for an instance-side fault', async () => {
    const store = createTestStore()
    listProjects.mockResolvedValue({
      ok: false,
      kind: 'api',
      error: 'Instance exploded',
      status: 500
    })

    await store.getState().listActiveCollabProjects()

    expect(status).not.toHaveBeenCalled()
    expect(store.getState().activeCollabLastError).toBe('Instance exploded')
  })
})

describe('createActiveCollabSlice connection lifecycle', () => {
  it('clears every cache and records the connection on connect', async () => {
    const store = createTestStore()
    store.setState({
      activeCollabTaskPageCache: { [implicitPageKey()]: pageEntry([task(1)]) }
    })
    connect.mockResolvedValue({
      ok: true,
      value: {
        instanceUrl: 'https://projects.example.com',
        userId: 7,
        userName: 'Jake',
        userEmail: 'jake@example.com'
      }
    })

    const result = await store.getState().connectActiveCollab({
      instanceUrl: 'https://projects.example.com',
      email: 'jake@example.com',
      password: 'secret'
    })

    expect(result.ok).toBe(true)
    expect(store.getState().activeCollabTaskPageCache).toEqual({})
    expect(store.getState().activeCollabStatus.configured).toBe(true)
    expect(store.getState().activeCollabStatus.connection?.userId).toBe(7)
    expect(store.getState().activeCollabConnecting).toBe(false)
    expect(status).not.toHaveBeenCalled()
  })

  it('reports a connect that resolved after the runtime context moved as superseded', async () => {
    const store = createTestStore()
    const pending = Promise.withResolvers<ActiveCollabResult<ActiveCollabConnection>>()
    connect.mockReturnValueOnce(pending.promise)

    const request = store.getState().connectActiveCollab({
      instanceUrl: 'https://projects.example.com',
      email: 'jake@example.com',
      password: 'secret'
    })
    store.setState({ settings: { activeRuntimeEnvironmentId: 'runtime-1' } as never })

    pending.resolve({
      ok: true,
      value: {
        instanceUrl: 'https://projects.example.com',
        userId: 7,
        userName: 'Jake',
        userEmail: 'jake@example.com'
      }
    })
    const result = await request

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('superseded')
    expect(store.getState().activeCollabStatus.configured).toBe(false)
    expect(store.getState().activeCollabConnecting).toBe(false)
  })

  it('clears caches and adopts the post-clear status on disconnect', async () => {
    const store = createTestStore()
    store.setState({
      activeCollabTaskPageCache: { [implicitPageKey()]: pageEntry([task(1)]) },
      activeCollabStatus: {
        configured: true,
        connection: {
          instanceUrl: 'https://projects.example.com',
          userId: 7,
          userName: 'Jake',
          userEmail: 'jake@example.com'
        },
        reason: ''
      }
    })
    disconnect.mockResolvedValue({
      ok: true,
      value: { configured: false, connection: null, reason: 'Not connected.' }
    })

    const result = await store.getState().disconnectActiveCollab()

    expect(unwrap(result).reason).toBe('Not connected.')
    expect(store.getState().activeCollabTaskPageCache).toEqual({})
    expect(store.getState().activeCollabStatus.configured).toBe(false)
    expect(store.getState().activeCollabConnecting).toBe(false)
  })

  it('ignores a status read that resolves after the runtime context moved', async () => {
    const store = createTestStore()
    const pending = Promise.withResolvers<ActiveCollabResult<ActiveCollabConnectionStatus>>()
    status.mockReturnValueOnce(pending.promise)

    const request = store.getState().checkActiveCollabConnection()
    store.setState({ settings: { activeRuntimeEnvironmentId: 'runtime-1' } as never })

    pending.resolve({
      ok: true,
      value: { configured: true, connection: null, reason: '' }
    })
    await request

    expect(store.getState().activeCollabStatus.configured).toBe(false)
    expect(store.getState().activeCollabStatusContextKey).toBeNull()
  })
})
