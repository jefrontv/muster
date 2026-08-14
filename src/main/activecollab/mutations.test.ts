import { describe, expect, it } from 'vitest'
import { ActiveCollabApiError, type AcHttpClient, type AcRequestOptions } from './http'
import {
  completeTask,
  createTask,
  listLabels,
  postComment,
  reopenTask,
  updateTask
} from './mutations'

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
      // No write moves bytes; attachment-image.test.ts and attachment-download.test.ts stub those.
      requestBinary(): never {
        throw new Error('requestBinary is not stubbed for task writes')
      },
      requestStream(): never {
        throw new Error('requestStream is not stubbed for task writes')
      }
    }
  }
}

// The zone is pinned because acDateForWrite deliberately emits the LOCAL calendar day, so an
// unpinned assertion would pass or fail depending on where the suite runs.
const ORIGINAL_TZ = process.env.TZ

function withTimeZone<T>(timeZone: string, run: () => T): T {
  process.env.TZ = timeZone
  try {
    return run()
  } finally {
    if (ORIGINAL_TZ === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = ORIGINAL_TZ
    }
  }
}

const TASK_ROW = {
  id: 509323,
  project_id: 3790,
  project_name: 'Website Rebuild',
  task_number: 42,
  name: 'Fix the header',
  body: '<p>Header is broken</p>',
  is_completed: false,
  completed_on: null,
  due_on: 1785110400,
  created_on: 1769385600,
  updated_on: 1769389200,
  assignee_id: 0,
  labels: [{ id: 16, name: 'Deferred', color: '#ff0000', is_global: false, position: '12' }],
  comments_count: 3,
  url_path: '/projects/3790/tasks/509323',
  task_list_id: 0
}

const TASK_PATH = 'projects/3790/tasks/509323'

describe('updateTask', () => {
  it('sends a due date as "YYYY-MM-DD" taken from the local calendar day', async () => {
    const http = stubHttp({ [TASK_PATH]: { data: { single: TASK_ROW } } })
    await withTimeZone('Australia/Sydney', () =>
      updateTask({
        http: http.client,
        projectId: 3790,
        taskId: 509323,
        // Local midnight on 2026-07-27 in Sydney, which is still the 26th in UTC.
        update: { dueOn: Date.parse('2026-07-26T14:00:00Z') }
      })
    )
    expect(http.calls[0]?.options?.method).toBe('PUT')
    expect(http.calls[0]?.options?.body).toEqual({ due_on: '2026-07-27' })
  })

  it('sends an explicit null to CLEAR a date, because omitting the key leaves it alone', async () => {
    const http = stubHttp({ [TASK_PATH]: { data: { single: TASK_ROW } } })
    await updateTask({
      http: http.client,
      projectId: 3790,
      taskId: 509323,
      update: { dueOn: null }
    })
    const body = http.calls[0]?.options?.body as Record<string, unknown>
    expect(body).toEqual({ due_on: null })
    expect('due_on' in body).toBe(true)
  })

  it('sends a start/due range as two date-only strings, never instants', async () => {
    const http = stubHttp({ [TASK_PATH]: { data: { single: TASK_ROW } } })
    await withTimeZone('Australia/Sydney', () =>
      updateTask({
        http: http.client,
        projectId: 3790,
        taskId: 509323,
        update: {
          // Local midnights in Sydney; both are still the PREVIOUS day in UTC.
          startOn: Date.parse('2026-07-26T14:00:00Z'),
          dueOn: Date.parse('2026-07-28T14:00:00Z')
        }
      })
    )
    expect(http.calls[0]?.options?.body).toEqual({ start_on: '2026-07-27', due_on: '2026-07-29' })
  })

  it('clears a range with explicit nulls on both date keys', async () => {
    const http = stubHttp({ [TASK_PATH]: { data: { single: TASK_ROW } } })
    await updateTask({
      http: http.client,
      projectId: 3790,
      taskId: 509323,
      update: { startOn: null, dueOn: null }
    })
    const body = http.calls[0]?.options?.body as Record<string, unknown>
    expect(body).toEqual({ start_on: null, due_on: null })
    expect('start_on' in body && 'due_on' in body).toBe(true)
  })

  it('omits every key the caller did not supply', async () => {
    const http = stubHttp({ [TASK_PATH]: { data: { single: TASK_ROW } } })
    await updateTask({
      http: http.client,
      projectId: 3790,
      taskId: 509323,
      update: { name: 'Renamed' }
    })
    expect(http.calls[0]?.options?.body).toEqual({ name: 'Renamed' })
  })

  it('sends labels as a full replacement array of bare name strings', async () => {
    const http = stubHttp({ [TASK_PATH]: { data: { single: TASK_ROW } } })
    await updateTask({
      http: http.client,
      projectId: 3790,
      taskId: 509323,
      update: { labelNames: ['Deferred', 'Blocked'] }
    })
    // A write REPLACES the set, so this is the merged list the caller computed, not a delta.
    expect(http.calls[0]?.options?.body).toEqual({ labels: ['Deferred', 'Blocked'] })
  })

  it('maps an empty body edit through, since "" clears the description', async () => {
    const http = stubHttp({ [TASK_PATH]: { data: { single: TASK_ROW } } })
    await updateTask({
      http: http.client,
      projectId: 3790,
      taskId: 509323,
      update: { bodyHtml: '', assigneeId: null }
    })
    expect(http.calls[0]?.options?.body).toEqual({ body: '', assignee_id: null })
  })

  it('normalises the echoed row, unwrapping the `single` envelope', async () => {
    const http = stubHttp({
      [TASK_PATH]: { data: { single: { ...TASK_ROW, name: 'Renamed', assignee_id: 7 } } }
    })
    const task = await updateTask({
      http: http.client,
      projectId: 3790,
      taskId: 509323,
      update: { name: 'Renamed' }
    })
    expect(task).toMatchObject({
      id: 509323,
      projectId: 3790,
      name: 'Renamed',
      assigneeId: 7,
      labels: [{ id: 16, name: 'Deferred', color: '#ff0000' }],
      urlPath: '/projects/3790/tasks/509323'
    })
  })

  it('answers null when the write landed but the instance echoed nothing usable', async () => {
    const http = stubHttp({ [TASK_PATH]: { data: {} } })
    await expect(
      updateTask({
        http: http.client,
        projectId: 3790,
        taskId: 509323,
        update: { name: 'Renamed' }
      })
    ).resolves.toBeNull()
  })
})

describe('completeTask / reopenTask', () => {
  it('completes at the project-scopeless route with no request body', async () => {
    const http = stubHttp({
      'complete/task/509323': { data: { single: { ...TASK_ROW, is_completed: true } } }
    })
    const task = await completeTask({ http: http.client, taskId: 509323 })
    expect(http.calls).toEqual([{ path: 'complete/task/509323', options: { method: 'PUT' } }])
    expect(task?.isCompleted).toBe(true)
  })

  it('reopens at `open/task/{id}`, which is the route ActiveCollab actually maps', async () => {
    const http = stubHttp({ 'open/task/509323': { data: { single: TASK_ROW } } })
    const task = await reopenTask({ http: http.client, taskId: 509323 })
    expect(http.calls[0]?.path).toBe('open/task/509323')
    expect(task?.isCompleted).toBe(false)
  })

  it('treats a completed_on timestamp as closed even when is_completed disagrees', async () => {
    const http = stubHttp({
      'complete/task/509323': {
        data: { single: { ...TASK_ROW, is_completed: false, completed_on: 1769389200 } }
      }
    })
    const task = await completeTask({ http: http.client, taskId: 509323 })
    expect(task?.isCompleted).toBe(true)
  })

  it('propagates an auth failure rather than swallowing it', async () => {
    const http = stubHttp({
      'complete/task/509323': new ActiveCollabApiError('Token expired', 401, true)
    })
    await expect(completeTask({ http: http.client, taskId: 509323 })).rejects.toBeInstanceOf(
      ActiveCollabApiError
    )
  })
})

describe('postComment', () => {
  it('posts to the project-scopeless comment route with a { body } payload', async () => {
    const http = stubHttp({
      'comments/task/509323': {
        data: {
          single: {
            id: 88,
            body: '<p>Shipped</p>',
            body_plain_text: 'Shipped',
            created_on: 1769385600,
            created_by_id: 42
          }
        }
      }
    })
    const comment = await postComment({
      http: http.client,
      taskId: 509323,
      bodyHtml: '<p>Shipped</p>'
    })
    expect(http.calls[0]).toEqual({
      path: 'comments/task/509323',
      options: { method: 'POST', body: { body: '<p>Shipped</p>' } }
    })
    expect(comment).toEqual({
      id: 88,
      bodyHtml: '<p>Shipped</p>',
      bodyPlainText: 'Shipped',
      createdOn: 1769385600000,
      createdById: 42,
      createdByName: null,
      attachments: []
    })
  })

  it('falls back to the HTML when no plain-text rendering came back', async () => {
    const http = stubHttp({
      'comments/task/509323': { data: { id: 88, body: '<p>Shipped</p>' } }
    })
    const comment = await postComment({ http: http.client, taskId: 509323, bodyHtml: 'x' })
    expect(comment?.bodyPlainText).toBe('<p>Shipped</p>')
  })

  it('sends no attach_uploaded_files key when nothing was staged', async () => {
    // Not an empty array: a plain comment has to post the exact body it always did, because a key
    // that only appeared once attachments shipped is a key no instance was ever tested against.
    const http = stubHttp({ 'comments/task/509323': { data: { id: 88, body: 'x' } } })

    await postComment({ http: http.client, taskId: 509323, bodyHtml: 'x', attachmentCodes: [] })
    await postComment({ http: http.client, taskId: 509323, bodyHtml: 'x' })

    for (const call of http.calls) {
      expect(call.options?.body).toEqual({ body: 'x' })
      expect(Object.keys(call.options?.body as object)).not.toContain('attach_uploaded_files')
    }
  })

  it('quotes the upload codes in attach_uploaded_files, in order', async () => {
    const http = stubHttp({
      'comments/task/509323': {
        data: { single: { id: 88, body: 'x', attachments: [{ id: 5, name: 'ac.png' }] } }
      }
    })

    const comment = await postComment({
      http: http.client,
      taskId: 509323,
      bodyHtml: '<p>Shipped</p>',
      attachmentCodes: ['FVz6RyPOo4mwh4NUVxoPLjg0tcHuBQt8AS2ggGVv', 'mmFavHAGsIrXiB5gDElxk5bI']
    })

    expect(http.calls[0].options?.body).toEqual({
      body: '<p>Shipped</p>',
      attach_uploaded_files: [
        'FVz6RyPOo4mwh4NUVxoPLjg0tcHuBQt8AS2ggGVv',
        'mmFavHAGsIrXiB5gDElxk5bI'
      ]
    })
    // The echoed row carries the REAL attachment records the codes turned into.
    expect(comment?.attachments.map((attachment) => attachment.name)).toEqual(['ac.png'])
  })
})

describe('listLabels', () => {
  it('reads the task-label vocabulary and normalises it', async () => {
    const http = stubHttp({
      'labels/task-labels': {
        data: [
          { id: 16, name: 'Deferred', color: '#ff0000' },
          { id: 17, name: 'Blocked', color: '' }
        ]
      }
    })
    await expect(listLabels({ http: http.client })).resolves.toEqual([
      { id: 16, name: 'Deferred', color: '#ff0000' },
      { id: 17, name: 'Blocked', color: null }
    ])
    expect(http.calls[0]?.path).toBe('labels/task-labels')
  })

  it('accepts the keyed envelope some builds wrap the collection in', async () => {
    const http = stubHttp({
      'labels/task-labels': { data: { labels: [{ id: 16, name: 'Deferred', color: null }] } }
    })
    await expect(listLabels({ http: http.client })).resolves.toEqual([
      { id: 16, name: 'Deferred', color: null }
    ])
  })

  it('drops entries with no usable name rather than rendering an empty chip', async () => {
    const http = stubHttp({
      'labels/task-labels': {
        data: [
          { id: 16, name: '  ' },
          { id: 17, name: 'Blocked' }
        ]
      }
    })
    await expect(listLabels({ http: http.client })).resolves.toEqual([
      { id: 17, name: 'Blocked', color: null }
    ])
  })
})

describe('createTask', () => {
  it('POSTs name and list to the project route and normalises the echoed row', async () => {
    const http = stubHttp({
      'projects/3790/tasks': {
        data: { single: { id: 991, project_id: 3790, name: 'Write the brief', task_list_id: 55 } }
      }
    })

    const task = await createTask({
      http: http.client,
      projectId: 3790,
      name: 'Write the brief',
      taskListId: 55
    })

    expect(http.calls).toEqual([
      {
        path: 'projects/3790/tasks',
        options: { method: 'POST', body: { name: 'Write the brief', task_list_id: 55 } }
      }
    ])
    expect(task?.id).toBe(991)
    expect(task?.taskListId).toBe(55)
  })

  it('omits task_list_id entirely for a listless create', async () => {
    const http = stubHttp({
      'projects/3790/tasks': { data: { single: { id: 992, project_id: 3790, name: 'Loose end' } } }
    })

    await createTask({ http: http.client, projectId: 3790, name: 'Loose end', taskListId: null })

    expect(http.calls[0]?.options?.body).toEqual({ name: 'Loose end' })
  })

  it('answers null when the instance echoes no usable row', async () => {
    const http = stubHttp({ 'projects/3790/tasks': { data: { single: { no: 'id' } } } })

    await expect(
      createTask({ http: http.client, projectId: 3790, name: 'X', taskListId: null })
    ).resolves.toBeNull()
  })
})
