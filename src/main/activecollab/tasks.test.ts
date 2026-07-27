import { describe, expect, it } from 'vitest'
import { ActiveCollabApiError, type AcHttpClient, type AcRequestOptions } from './http'
import { getTaskDetail, listAssignedTasks, listProjects } from './tasks'

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
      // Nothing under test here downloads bytes; attachment-image.test.ts stubs the real thing.
      requestBinary(): never {
        throw new Error('requestBinary is not stubbed for task reads')
      }
    }
  }
}

// 2026-01-27T00:00:00Z — the UTC midnight ActiveCollab serialises a date-only field as.
const DUE_ON = 1769472000
const CREATED_ON = 1769385600
const UPDATED_ON = 1769389200

const OPEN_TASK = {
  id: 509323,
  project_id: 3790,
  project_name: 'Website Rebuild',
  task_number: 42,
  name: 'Fix the header',
  body: '<p>Header is broken</p>',
  is_completed: false,
  completed_on: null,
  due_on: DUE_ON,
  created_on: CREATED_ON,
  updated_on: UPDATED_ON,
  // `0` is the null sentinel, not user zero.
  assignee_id: 0,
  labels: [{ id: 16, name: 'Deferred', color: null, is_global: false, position: '12' }],
  comments_count: 3,
  url_path: '/projects/3790/tasks/509323',
  task_list_id: 0
}

const COMMENT = {
  id: 88,
  body: '<p>Shipped</p>',
  body_plain_text: 'Shipped',
  created_on: CREATED_ON,
  created_by_id: 42
}

// The pair verified on the target instance, hanging off task 509311 in project 5849.
const TASK_ATTACHMENTS = [
  {
    id: 249086,
    class: 'LocalAttachment',
    name: 'screenshot.jpg',
    mime_type: 'image/jpeg',
    size: 560295,
    md5: 'd41d8cd98f00b204e9800998ecf8427e',
    url_path: '/attachments/249086',
    parent_type: 'Task',
    parent_id: 509311
  },
  {
    id: 249087,
    class: 'LocalAttachment',
    name: 'diagram.png',
    mime_type: 'image/png',
    size: 29789,
    parent_type: 'Task',
    parent_id: 509311
  }
]

describe('listAssignedTasks', () => {
  it('normalises a task row into the shape the rest of Muster consumes', async () => {
    const http = stubHttp({ 'users/42/tasks': { data: { tasks: [OPEN_TASK] } } })

    const page = await listAssignedTasks({ http: http.client, userId: 42 })

    expect(page.tasks).toHaveLength(1)
    const [task] = page.tasks
    expect(task).toMatchObject({
      id: 509323,
      projectId: 3790,
      projectName: 'Website Rebuild',
      taskNumber: 42,
      name: 'Fix the header',
      bodyHtml: '<p>Header is broken</p>',
      isCompleted: false,
      createdOn: CREATED_ON * 1000,
      updatedOn: UPDATED_ON * 1000,
      // `0` must not become "user 0" or "task list 0".
      assigneeId: null,
      taskListId: null,
      assigneeName: null,
      commentCount: 3,
      urlPath: '/projects/3790/tasks/509323'
    })
    expect(task.labels).toEqual([{ id: 16, name: 'Deferred', color: null }])
  })

  it('re-anchors a UTC-midnight due date onto the local calendar day', async () => {
    const http = stubHttp({ 'users/42/tasks': { data: { tasks: [OPEN_TASK] } } })

    const page = await listAssignedTasks({ http: http.client, userId: 42 })

    const due = new Date(page.tasks[0].dueOn ?? 0)
    // Read with local getters: without re-anchoring this lands on the 26th west of UTC.
    expect([due.getFullYear(), due.getMonth() + 1, due.getDate()]).toEqual([2026, 1, 27])
    expect([due.getHours(), due.getMinutes()]).toEqual([0, 0])
  })

  it('drops completed tasks client-side, because the server ignores the filter', async () => {
    const http = stubHttp({
      'users/42/tasks': {
        data: {
          tasks: [
            OPEN_TASK,
            { ...OPEN_TASK, id: 2, is_completed: true },
            // `is_completed` lies on some rows; a completion timestamp closes the task too.
            { ...OPEN_TASK, id: 3, is_completed: false, completed_on: 1769000000 }
          ]
        }
      }
    })

    const page = await listAssignedTasks({ http: http.client, userId: 42 })

    expect(page.tasks.map((task) => task.id)).toEqual([509323])
  })

  it('derives hasMore from the pagination headers, not from the array it returns', async () => {
    const http = stubHttp({
      'users/42/tasks': {
        data: {
          tasks: [OPEN_TASK, { ...OPEN_TASK, id: 2, is_completed: true }]
        },
        totalItems: 250,
        page: 1,
        perPage: 100
      }
    })

    const page = await listAssignedTasks({ http: http.client, userId: 42 })

    // Two rows in, one row out, yet 250 items across 100-row pages still means more.
    expect(page.tasks).toHaveLength(1)
    expect(page.totalItems).toBe(250)
    expect(page.hasMore).toBe(true)
  })

  it('reports no more pages once the headers say the total is covered', async () => {
    const http = stubHttp({
      'users/42/tasks': { data: { tasks: [OPEN_TASK] }, totalItems: 250, page: 3, perPage: 100 }
    })

    const page = await listAssignedTasks({ http: http.client, userId: 42, page: 3 })

    expect(page.hasMore).toBe(false)
  })

  it('treats a page filled to the server cap as having a successor when headers are absent', async () => {
    const full = Array.from({ length: 100 }, (_, index) => ({ ...OPEN_TASK, id: index + 1 }))
    const http = stubHttp({ 'users/42/tasks': { data: full } })

    await expect(listAssignedTasks({ http: http.client, userId: 42 })).resolves.toMatchObject({
      hasMore: true,
      totalItems: null
    })
  })

  it('requests the page the caller asked for', async () => {
    const http = stubHttp({ 'users/42/tasks': { data: [] } })

    await listAssignedTasks({ http: http.client, userId: 42, page: 4 })

    expect(http.calls).toEqual([{ path: 'users/42/tasks', options: { query: { page: 4 } } }])
  })

  it('takes an assignee name from either spelling and leaves it null when absent', async () => {
    const http = stubHttp({
      'users/42/tasks': {
        data: {
          tasks: [
            { ...OPEN_TASK, id: 1, assignee_id: 42, assignee_name: 'Ada Lovelace' },
            { ...OPEN_TASK, id: 2, assignee_id: 7, assignee_names: ['Grace Hopper'] },
            { ...OPEN_TASK, id: 3, assignee_id: 9 }
          ]
        }
      }
    })

    const page = await listAssignedTasks({ http: http.client, userId: 42 })

    expect(page.tasks.map((task) => task.assigneeName)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      null
    ])
  })
})

describe('listProjects', () => {
  it('carries count_tasks into the badge count and keeps it null when the field is absent', async () => {
    const http = stubHttp({
      projects: {
        data: [
          { id: 3790, name: 'Website Rebuild', is_completed: false, count_tasks: 17 },
          { id: 3791, name: 'Archived Site', is_completed: true },
          { id: 3792, name: 'Wrapped Up', completed_on: 1769000000 }
        ]
      }
    })

    await expect(listProjects({ http: http.client })).resolves.toEqual([
      { id: 3790, name: 'Website Rebuild', isCompleted: false, openTaskCount: 17 },
      { id: 3791, name: 'Archived Site', isCompleted: true, openTaskCount: null },
      { id: 3792, name: 'Wrapped Up', isCompleted: true, openTaskCount: null }
    ])
  })
})

describe('getTaskDetail', () => {
  it('reads comments inline and never touches the broken dedicated endpoint', async () => {
    const http = stubHttp({
      'projects/3790/tasks/509323': { data: { single: OPEN_TASK, comments: [COMMENT] } }
    })

    const detail = await getTaskDetail({ http: http.client, projectId: 3790, taskId: 509323 })

    expect(detail.task.id).toBe(509323)
    expect(detail.comments).toEqual([
      {
        id: 88,
        bodyHtml: '<p>Shipped</p>',
        bodyPlainText: 'Shipped',
        createdOn: CREATED_ON * 1000,
        createdById: 42,
        // Only an author id is on the wire, so no name is invented.
        createdByName: null,
        attachments: []
      }
    ])
    expect(http.calls.map((call) => call.path)).toEqual(['projects/3790/tasks/509323'])
  })

  it('falls back to the dedicated endpoint only when the inline array is empty', async () => {
    const http = stubHttp({
      'projects/3790/tasks/509323': { data: { single: OPEN_TASK, comments: [] } },
      'projects/3790/tasks/509323/comments': { data: [{ ...COMMENT, body_plain_text: undefined }] }
    })

    const detail = await getTaskDetail({ http: http.client, projectId: 3790, taskId: 509323 })

    // Tasks have no plain-text rendering, so the HTML stands in for a missing one.
    expect(detail.comments).toMatchObject([{ id: 88, bodyPlainText: '<p>Shipped</p>' }])
    expect(http.calls).toHaveLength(2)
  })

  it('degrades to an empty thread when the comments endpoint 500s', async () => {
    const http = stubHttp({
      'projects/3790/tasks/509323': { data: { single: OPEN_TASK, comments: [] } },
      'projects/3790/tasks/509323/comments': new ActiveCollabApiError(
        'Failed to match /projects/3790/tasks/509323/comments path',
        500,
        false
      )
    })

    const detail = await getTaskDetail({ http: http.client, projectId: 3790, taskId: 509323 })

    // Losing the comments must not lose the task that already loaded.
    expect(detail.task.id).toBe(509323)
    expect(detail.comments).toEqual([])
  })

  it('throws when the response carries no task', async () => {
    const http = stubHttp({ 'projects/3790/tasks/509323': { data: { single: null } } })

    await expect(
      getTaskDetail({ http: http.client, projectId: 3790, taskId: 509323 })
    ).rejects.toThrow('ActiveCollab task 509323 was not found in project 3790.')
  })

  it('reads task attachments from the top-level sidecar and comment attachments from the row', async () => {
    const http = stubHttp({
      'projects/3790/tasks/509323': {
        data: {
          single: OPEN_TASK,
          comments: [{ ...COMMENT, attachments: [TASK_ATTACHMENTS[1]] }],
          attachments: TASK_ATTACHMENTS
        }
      }
    })

    const detail = await getTaskDetail({ http: http.client, projectId: 3790, taskId: 509323 })

    expect(detail.attachments).toEqual([
      { id: 249086, name: 'screenshot.jpg', mimeType: 'image/jpeg', size: 560295, isImage: true },
      { id: 249087, name: 'diagram.png', mimeType: 'image/png', size: 29789, isImage: true }
    ])
    // A comment carries its own list, never the task's.
    expect(detail.comments[0].attachments).toEqual([
      { id: 249087, name: 'diagram.png', mimeType: 'image/png', size: 29789, isImage: true }
    ])
  })

  it('reads attachments nested on the task record when the envelope has no sidecar', async () => {
    const http = stubHttp({
      'projects/3790/tasks/509323': {
        data: { single: { ...OPEN_TASK, attachments: TASK_ATTACHMENTS }, comments: [COMMENT] }
      }
    })

    const detail = await getTaskDetail({ http: http.client, projectId: 3790, taskId: 509323 })

    expect(detail.attachments.map((attachment) => attachment.id)).toEqual([249086, 249087])
    expect(detail.comments[0].attachments).toEqual([])
  })

  it('answers an empty list when the payload carries no attachments at all', async () => {
    const http = stubHttp({
      'projects/3790/tasks/509323': { data: { single: OPEN_TASK, comments: [COMMENT] } }
    })

    await expect(
      getTaskDetail({ http: http.client, projectId: 3790, taskId: 509323 })
    ).resolves.toMatchObject({ attachments: [] })
  })
})
