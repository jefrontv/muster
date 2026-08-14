import { beforeEach, describe, expect, it } from 'vitest'
import type { ActiveCollabTask } from '../../shared/activecollab-types'
import { ActiveCollabApiError, type AcHttpClient } from './http'
import {
  acNameDirectory,
  acResolveTaskNames,
  resetAcNameDirectoryCache,
  type AcNameDirectoryLoader
} from './name-directory'

type Route = { data: unknown } | ActiveCollabApiError

type StubHttp = {
  client: AcHttpClient
  /** Requests per path, so a test can assert the join cost rather than just its result. */
  counts: Record<string, number>
}

/**
 * `gate` holds every response until it settles, so two callers can be in flight at once and the
 * dedup under test is the SHARED PROMISE, not a cache that had already filled.
 */
function stubHttp(routes: Record<string, Route>, gate?: Promise<void>): StubHttp {
  const counts: Record<string, number> = {}
  return {
    counts,
    client: {
      async request<T>(path: string) {
        counts[path] = (counts[path] ?? 0) + 1
        if (gate) {
          await gate
        }
        const route = routes[path]
        if (route === undefined) {
          throw new ActiveCollabApiError(`No stub route for ${path}`, 404, false)
        }
        if (route instanceof ActiveCollabApiError) {
          throw route
        }
        return { data: route.data as T, totalItems: null, page: null, perPage: null }
      },
      requestBinary(): never {
        throw new Error('requestBinary is not stubbed for the name directory')
      },
      requestStream(): never {
        throw new Error('requestStream is not stubbed for the name directory')
      }
    }
  }
}

const PROJECTS: Route = {
  data: [
    { id: 3790, name: 'Website Rebuild' },
    { id: 5937, name: '30494 - Orleton OM' }
  ]
}

// Envelope form on purpose: `/users` answers `{ users: [...] }` where `/projects` answers bare.
const USERS: Route = {
  data: {
    users: [
      { id: 407, display_name: 'Jake Varrese' },
      { id: 7, display_name: 'Grace Hopper' }
    ]
  }
}

const HEALTHY: Record<string, Route> = { projects: PROJECTS, users: USERS }

function taskRow(over: Partial<ActiveCollabTask> = {}): ActiveCollabTask {
  return {
    id: 509323,
    projectId: 3790,
    projectName: '',
    taskNumber: 42,
    name: 'Fix the header',
    bodyHtml: '',
    isCompleted: false,
    startOn: null,
    dueOn: null,
    createdOn: null,
    updatedOn: null,
    assigneeId: 407,
    assigneeName: null,
    createdById: null,
    createdByName: null,
    labels: [],
    commentCount: 0,
    urlPath: '/projects/3790/tasks/509323',
    taskListId: null,
    isHiddenFromClients: false,
    ...over
  }
}

function loaderFor(http: AcHttpClient, over: { userId?: number; nowImpl?: () => number } = {}) {
  return acNameDirectory({
    http,
    instanceUrl: 'https://projects.example.com',
    userId: over.userId ?? 42,
    nowImpl: over.nowImpl
  })
}

async function resolve(loader: AcNameDirectoryLoader, tasks: ActiveCollabTask[]): Promise<void> {
  await acResolveTaskNames(loader(), tasks)
}

beforeEach(() => {
  resetAcNameDirectoryCache()
})

describe('acResolveTaskNames', () => {
  it('joins the project name onto a row the server sent without one', async () => {
    const http = stubHttp(HEALTHY)
    const task = taskRow()

    await resolve(loaderFor(http.client), [task])

    expect(task.projectName).toBe('Website Rebuild')
  })

  it('joins the assignee name onto a row the server sent without one', async () => {
    const http = stubHttp(HEALTHY)
    const task = taskRow()

    await resolve(loaderFor(http.client), [task])

    expect(task.assigneeName).toBe('Jake Varrese')
  })

  it('keeps a name the row already carried, because the server outranks the join', async () => {
    const http = stubHttp({
      projects: { data: [{ id: 3790, name: 'Stale Directory Name' }] },
      users: { data: { users: [{ id: 407, display_name: 'Stale Directory Person' }] } }
    })
    const task = taskRow({ projectName: 'Row Project', assigneeName: 'Row Person' })

    await resolve(loaderFor(http.client), [task])

    expect(task).toMatchObject({ projectName: 'Row Project', assigneeName: 'Row Person' })
  })

  it('leaves an unresolvable assignee null rather than inventing a name for them', async () => {
    const http = stubHttp(HEALTHY)
    // 9999 is not in the roster: assigned to SOMEONE the directory cannot name.
    const unresolvable = taskRow({ id: 1, assigneeId: 9999 })
    const unassigned = taskRow({ id: 2, assigneeId: null })

    await resolve(loaderFor(http.client), [unresolvable, unassigned])

    expect(unresolvable).toMatchObject({ assigneeId: 9999, assigneeName: null })
    // The two states stay distinguishable, which is what stops the UI calling the first one
    // "Unassigned" when it is merely unnamed.
    expect(unassigned).toMatchObject({ assigneeId: null, assigneeName: null })
  })

  it('leaves an unresolvable project name empty rather than guessing', async () => {
    const http = stubHttp(HEALTHY)
    const task = taskRow({ projectId: 111 })

    await resolve(loaderFor(http.client), [task])

    expect(task.projectName).toBe('')
  })

  it('skips a null row, so a write that echoed nothing cannot crash the join', async () => {
    const http = stubHttp(HEALTHY)

    await expect(acResolveTaskNames(loaderFor(http.client)(), [null])).resolves.toBeUndefined()
  })
})

describe('request cost', () => {
  it('reads each collection once for a whole page of rows', async () => {
    const http = stubHttp(HEALTHY)
    const tasks = Array.from({ length: 100 }, (_, index) => taskRow({ id: index + 1 }))

    await resolve(loaderFor(http.client), tasks)

    expect(http.counts).toEqual({ projects: 1, users: 1 })
    expect(tasks.every((task) => task.projectName === 'Website Rebuild')).toBe(true)
  })

  it('shares one in-flight read between callers that arrive together', async () => {
    let open: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      open = resolve
    })
    const http = stubHttp(HEALTHY, gate)
    const loader = loaderFor(http.client)

    // Both start before either can settle: the second must join the first, not race it.
    const first = loader()
    const second = loader()
    open()
    await Promise.all([first, second])

    expect(http.counts).toEqual({ projects: 1, users: 1 })
    expect(first).toBe(second)
  })

  it('serves a second operation from cache even though it built a fresh client', async () => {
    const first = stubHttp(HEALTHY)
    const second = stubHttp(HEALTHY)
    const task = taskRow()

    // The ipc layer builds a new AcHttpClient per call by design; the directory is keyed on the
    // credential, so the second call must not pay for the roster again.
    await resolve(loaderFor(first.client), [taskRow()])
    await resolve(loaderFor(second.client), [task])

    expect(first.counts).toEqual({ projects: 1, users: 1 })
    expect(second.counts).toEqual({})
    expect(task.projectName).toBe('Website Rebuild')
  })

  it('refetches once the TTL window has passed', async () => {
    const http = stubHttp(HEALTHY)
    let clock = 1_000_000
    const loader = loaderFor(http.client, { nowImpl: () => clock })

    await resolve(loader, [taskRow()])
    // One second short of five minutes: still the same window.
    clock += 5 * 60_000 - 1
    await resolve(loader, [taskRow()])
    expect(http.counts).toEqual({ projects: 1, users: 1 })

    clock += 1
    await resolve(loader, [taskRow()])
    expect(http.counts).toEqual({ projects: 2, users: 2 })
  })

  it('drops every cached directory on reset, so a disconnect cannot leak names forward', async () => {
    const http = stubHttp(HEALTHY)
    const loader = loaderFor(http.client)

    await resolve(loader, [taskRow()])
    resetAcNameDirectoryCache()
    await resolve(loader, [taskRow()])

    expect(http.counts).toEqual({ projects: 2, users: 2 })
  })
})

describe('credential isolation', () => {
  it('never serves one account the names cached for another', async () => {
    const mine = stubHttp(HEALTHY)
    const theirs = stubHttp({
      projects: { data: [{ id: 3790, name: 'Their Project' }] },
      users: { data: { users: [{ id: 407, display_name: 'Their Colleague' }] } }
    })
    const myTask = taskRow()
    const theirTask = taskRow()

    await resolve(loaderFor(mine.client, { userId: 42 }), [myTask])
    await resolve(loaderFor(theirs.client, { userId: 99 }), [theirTask])

    expect(myTask).toMatchObject({
      projectName: 'Website Rebuild',
      assigneeName: 'Jake Varrese'
    })
    expect(theirTask).toMatchObject({
      projectName: 'Their Project',
      assigneeName: 'Their Colleague'
    })
    // Each identity paid for its own roster; neither was skipped as "already cached".
    expect(mine.counts).toEqual({ projects: 1, users: 1 })
    expect(theirs.counts).toEqual({ projects: 1, users: 1 })
  })

  it('separates two users on the same instance, not just two instances', async () => {
    const first = stubHttp(HEALTHY)
    const second = stubHttp(HEALTHY)

    await resolve(loaderFor(first.client, { userId: 42 }), [taskRow()])
    await resolve(loaderFor(second.client, { userId: 43 }), [taskRow()])

    expect(second.counts).toEqual({ projects: 1, users: 1 })
  })
})

describe('degradation', () => {
  it('still resolves assignees when the project list fails', async () => {
    const http = stubHttp({
      projects: new ActiveCollabApiError('Service unavailable', 503, false),
      users: USERS
    })
    const task = taskRow()

    await expect(resolve(loaderFor(http.client), [task])).resolves.toBeUndefined()

    expect(task).toMatchObject({ projectName: '', assigneeName: 'Jake Varrese' })
  })

  it('still resolves projects when the user roster fails', async () => {
    const http = stubHttp({
      projects: PROJECTS,
      users: new ActiveCollabApiError('Service unavailable', 500, false)
    })
    const task = taskRow()

    await expect(resolve(loaderFor(http.client), [task])).resolves.toBeUndefined()

    expect(task).toMatchObject({ projectName: 'Website Rebuild', assigneeName: null })
  })

  it('degrades the same way when an instance admin-gates the roster with a 403', async () => {
    const http = stubHttp({
      projects: PROJECTS,
      // 403 is an auth error upstream; swallowing it here is what stops a name lookup from
      // putting a reconnect prompt in front of a task list that loaded perfectly well.
      users: new ActiveCollabApiError('Access denied', 403, true)
    })
    const task = taskRow()

    await expect(resolve(loaderFor(http.client), [task])).resolves.toBeUndefined()

    expect(task).toMatchObject({
      projectName: 'Website Rebuild',
      assigneeId: 407,
      assigneeName: null
    })
  })

  it('survives both collections failing at once', async () => {
    const http = stubHttp({
      projects: new ActiveCollabApiError('down', 503, false),
      users: new ActiveCollabApiError('down', 503, false)
    })
    const task = taskRow()

    await expect(resolve(loaderFor(http.client), [task])).resolves.toBeUndefined()

    expect(task).toMatchObject({ projectName: '', assigneeName: null })
  })

  it('retries a failed window sooner than a successful one', async () => {
    const http = stubHttp({
      projects: PROJECTS,
      users: new ActiveCollabApiError('down', 503, false)
    })
    let clock = 1_000_000
    const loader = loaderFor(http.client, { nowImpl: () => clock })

    await resolve(loader, [taskRow()])
    // Inside the 30s failure window: a per-call retry would be a request storm.
    clock += 29_999
    await resolve(loader, [taskRow()])
    expect(http.counts).toEqual({ projects: 1, users: 1 })

    // Past it, and long before the five-minute success TTL would have expired.
    clock += 1
    await resolve(loader, [taskRow()])
    expect(http.counts).toEqual({ projects: 2, users: 2 })
  })
})
