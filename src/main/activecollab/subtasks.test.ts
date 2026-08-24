import { describe, expect, it } from 'vitest'
import { ActiveCollabApiError, type AcHttpClient, type AcRequestOptions } from './http'
import { completeSubtask, createSubtask, reopenSubtask, updateSubtask } from './subtasks'

type Reply = { data: unknown; totalItems?: number; page?: number; perPage?: number }

type StubHttp = {
  client: AcHttpClient
  calls: { path: string; options?: AcRequestOptions }[]
}

/** Routes keyed by request path; an ActiveCollabApiError value is thrown instead of returned. */
function stubHttp(routes: Record<string, Reply | ActiveCollabApiError>): StubHttp {
  const calls: StubHttp['calls'] = []
  return {
    calls,
    client: {
      async request<T>(path: string, options?: AcRequestOptions) {
        calls.push({ path, options })
        const route = routes[path]
        if (route === undefined) {
          throw new ActiveCollabApiError(`No stub route for ${path}`, 404, false)
        }
        if (route instanceof ActiveCollabApiError) {
          throw route
        }
        return {
          data: route.data as T,
          totalItems: route.totalItems ?? null,
          page: route.page ?? null,
          perPage: route.perPage ?? null
        }
      },
      requestBinary(): never {
        throw new Error('requestBinary is not stubbed for subtask writes')
      },
      requestStream(): never {
        throw new Error('requestStream is not stubbed for subtask writes')
      }
    }
  }
}

const SUBTASK_ROW = {
  id: 88,
  task_id: 509323,
  name: 'Draft the copy',
  is_completed: false,
  completed_on: null,
  assignee_id: 0,
  due_on: 1785110400,
  created_on: 1769385600
}

const SUBTASK_PATH = 'projects/3790/tasks/509323/subtasks'

describe('createSubtask', () => {
  it('POSTs name under both spellings plus the optional fields, and normalises the echo', async () => {
    const http = stubHttp({
      [SUBTASK_PATH]: { data: { single: { ...SUBTASK_ROW, assignee_id: 42 } } }
    })

    const subtask = await createSubtask({
      http: http.client,
      projectId: 3790,
      taskId: 509323,
      name: 'Draft the copy',
      assigneeId: 42
    })

    expect(http.calls[0]).toEqual({
      path: SUBTASK_PATH,
      options: {
        method: 'POST',
        body: { name: 'Draft the copy', body: 'Draft the copy', assignee_id: 42 }
      }
    })
    expect(subtask).toMatchObject({
      id: 88,
      taskId: 509323,
      name: 'Draft the copy',
      assigneeId: 42
    })
  })

  it('omits assignee_id and due_on entirely when neither was supplied', async () => {
    const http = stubHttp({ [SUBTASK_PATH]: { data: { single: SUBTASK_ROW } } })

    await createSubtask({
      http: http.client,
      projectId: 3790,
      taskId: 509323,
      name: 'Draft the copy'
    })

    expect(http.calls[0]?.options?.body).toEqual({
      name: 'Draft the copy',
      body: 'Draft the copy'
    })
  })

  it('answers null when the instance echoes no usable row', async () => {
    const http = stubHttp({ [SUBTASK_PATH]: { data: { single: { no: 'id' } } } })

    await expect(
      createSubtask({ http: http.client, projectId: 3790, taskId: 509323, name: 'X' })
    ).resolves.toBeNull()
  })
})

describe('updateSubtask', () => {
  it('PUTs the field edit to the subtask route and reads both spellings on the echo', async () => {
    const http = stubHttp({
      [`${SUBTASK_PATH}/88`]: { data: { single: { ...SUBTASK_ROW, name: 'Renamed' } } }
    })

    const subtask = await updateSubtask({
      http: http.client,
      projectId: 3790,
      taskId: 509323,
      subtaskId: 88,
      update: { name: 'Renamed' }
    })

    expect(http.calls[0]?.path).toBe(`${SUBTASK_PATH}/88`)
    expect(http.calls[0]?.options?.body).toEqual({ name: 'Renamed', body: 'Renamed' })
    expect(subtask?.name).toBe('Renamed')
  })

  it('clears a due date with an explicit null', async () => {
    const http = stubHttp({ [`${SUBTASK_PATH}/88`]: { data: { single: SUBTASK_ROW } } })

    await updateSubtask({
      http: http.client,
      projectId: 3790,
      taskId: 509323,
      subtaskId: 88,
      update: { dueOn: null }
    })

    const body = http.calls[0]?.options?.body as Record<string, unknown>
    expect(body).toEqual({ due_on: null })
    expect('due_on' in body).toBe(true)
  })
})

describe('completeSubtask / reopenSubtask', () => {
  it('completes at the project-scopeless route with no request body', async () => {
    const http = stubHttp({
      'complete/subtask/88': { data: { single: { ...SUBTASK_ROW, is_completed: true } } }
    })
    const subtask = await completeSubtask({ http: http.client, subtaskId: 88 })
    expect(http.calls).toEqual([{ path: 'complete/subtask/88', options: { method: 'PUT' } }])
    expect(subtask?.isCompleted).toBe(true)
  })

  it('reopens at `open/subtask/{id}`, the route ActiveCollab actually maps', async () => {
    const http = stubHttp({ 'open/subtask/88': { data: { single: SUBTASK_ROW } } })
    const subtask = await reopenSubtask({ http: http.client, subtaskId: 88 })
    expect(http.calls[0]?.path).toBe('open/subtask/88')
    expect(subtask?.isCompleted).toBe(false)
  })

  it('propagates an auth failure rather than swallowing it', async () => {
    const http = stubHttp({
      'complete/subtask/88': new ActiveCollabApiError('Token expired', 401, true)
    })
    await expect(completeSubtask({ http: http.client, subtaskId: 88 })).rejects.toBeInstanceOf(
      ActiveCollabApiError
    )
  })
})
