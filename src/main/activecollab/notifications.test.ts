import { describe, expect, it } from 'vitest'
import { ActiveCollabApiError, type AcHttpClient, type AcRequestOptions } from './http'
import { listObjectUpdates } from './notifications'

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
        throw new Error('requestBinary is not stubbed for notifications')
      },
      requestStream(): never {
        throw new Error('requestStream is not stubbed for notifications')
      }
    }
  }
}

const PATH = 'notifications/object-updates'

/** One wire row: the `object` block plus the `updates`/`last_update_on`/`is_subscribed` siblings. */
function entry(
  objectOverrides: Record<string, unknown> = {},
  entryOverrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    object: {
      id: 509323,
      class: 'Task',
      name: 'Fix the header',
      project_id: 3790,
      task_number: 42,
      ...objectOverrides
    },
    updates: { new_comments: 3 },
    last_update_on: 1785110400,
    is_subscribed: true,
    ...entryOverrides
  }
}

describe('listObjectUpdates', () => {
  it('GETs the object-updates route with the page param, defaulting to page 1', async () => {
    const http = stubHttp({ [PATH]: { data: { objects_and_updates: [], total_unread: -1 } } })

    await listObjectUpdates({ http: http.client })
    await listObjectUpdates({ http: http.client, page: 3 })

    expect(http.calls).toEqual([
      { path: PATH, options: { query: { page: 1 } } },
      { path: PATH, options: { query: { page: 3 } } }
    ])
  })

  it('collapses a keyed updates object into ordered kinds', async () => {
    const http = stubHttp({
      [PATH]: {
        data: {
          objects_and_updates: [
            entry({}, { updates: { new_comments: 3, mentions: 1, new_instance: 1, reassigned: 2 } })
          ],
          related: {},
          total_unread: -1
        }
      }
    })

    const result = await listObjectUpdates({ http: http.client })
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0].kinds).toEqual([
      { kind: 'comment', count: 3 },
      { kind: 'mention', count: 1 },
      { kind: 'created', count: 1 },
      { kind: 'reassigned', count: 2 }
    ])
  })

  it('reads an empty-array updates field as no kinds', async () => {
    const http = stubHttp({
      [PATH]: { data: { objects_and_updates: [entry({}, { updates: [] })], total_unread: -1 } }
    })

    const result = await listObjectUpdates({ http: http.client })
    expect(result.updates[0].kinds).toEqual([])
  })

  it('folds an unknown update key onto other rather than dropping it', async () => {
    const http = stubHttp({
      [PATH]: {
        data: {
          objects_and_updates: [entry({}, { updates: { some_future_key: 5 } })],
          total_unread: -1
        }
      }
    })

    const result = await listObjectUpdates({ http: http.client })
    expect(result.updates[0].kinds).toEqual([{ kind: 'other', count: 5 }])
  })

  it('maps a total_unread of -1 to null, never rendering a negative count', async () => {
    const http = stubHttp({
      [PATH]: { data: { objects_and_updates: [entry()], total_unread: -1 } }
    })

    const result = await listObjectUpdates({ http: http.client })
    expect(result.totalUnread).toBeNull()
  })

  it('passes a real total_unread through untouched', async () => {
    const http = stubHttp({
      [PATH]: { data: { objects_and_updates: [entry()], total_unread: 12 } }
    })

    const result = await listObjectUpdates({ http: http.client })
    expect(result.totalUnread).toBe(12)
  })

  it('joins the project name from the related sidecar, empty when the sidecar omits it', async () => {
    const named = stubHttp({
      [PATH]: {
        data: {
          objects_and_updates: [entry()],
          related: { Project: { '3790': { id: 3790, name: 'Website Rebuild' } } },
          total_unread: -1
        }
      }
    })
    const unnamed = stubHttp({
      [PATH]: { data: { objects_and_updates: [entry()], total_unread: -1 } }
    })

    const joined = await listObjectUpdates({ http: named.client })
    const absent = await listObjectUpdates({ http: unnamed.client })
    expect(joined.updates[0].projectName).toBe('Website Rebuild')
    expect(absent.updates[0].projectName).toBe('')
  })

  it('skips non-Task rows and rows without a usable task or project id', async () => {
    const http = stubHttp({
      [PATH]: {
        data: {
          objects_and_updates: [
            entry({ class: 'Note' }),
            entry({ id: 0 }),
            entry({ project_id: 0 }),
            entry()
          ],
          related: {},
          total_unread: -1
        }
      }
    })

    const result = await listObjectUpdates({ http: http.client })
    expect(result.updates.map((u) => u.taskId)).toEqual([509323])
  })

  it('derives hasMore from the pagination headers, not the row count', async () => {
    const http = stubHttp({
      [PATH]: {
        data: { objects_and_updates: [entry()], total_unread: -1 },
        page: 1,
        perPage: 30,
        totalItems: 31
      }
    })

    const result = await listObjectUpdates({ http: http.client })
    expect(result.hasMore).toBe(true)
  })

  it('falls back to a full page when the totals header is absent', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => entry({ id: i + 1 }))
    const short = stubHttp({
      [PATH]: { data: { objects_and_updates: [entry()], total_unread: -1 } }
    })
    const full = stubHttp({
      [PATH]: { data: { objects_and_updates: rows, total_unread: -1 } }
    })

    expect((await listObjectUpdates({ http: short.client })).hasMore).toBe(false)
    expect((await listObjectUpdates({ http: full.client })).hasMore).toBe(true)
  })

  it('propagates an auth error so the caller maps it to a reconnect', async () => {
    const authError = new ActiveCollabApiError('Token rejected', 401, true)
    const http = stubHttp({ [PATH]: authError })

    await expect(listObjectUpdates({ http: http.client })).rejects.toBe(authError)
  })
})
