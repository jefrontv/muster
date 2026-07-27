import { describe, expect, it } from 'vitest'
import { ActiveCollabApiError, type AcHttpClient, type AcRequestOptions } from './http'
import { listUsers } from './users'

type StubHttp = {
  client: AcHttpClient
  calls: { path: string; options?: AcRequestOptions }[]
}

function stubHttp(data: unknown): StubHttp {
  const calls: StubHttp['calls'] = []
  return {
    calls,
    client: {
      async request<T>(path: string, options?: AcRequestOptions) {
        calls.push({ path, options })
        if (path !== 'users') {
          throw new ActiveCollabApiError(`No stub route for ${path}`, 404, false)
        }
        return { data: data as T, totalItems: null, page: null, perPage: null }
      },
      requestBinary(): never {
        throw new Error('requestBinary is not stubbed for the user roster')
      },
      requestStream(): never {
        throw new Error('requestStream is not stubbed for the user roster')
      }
    }
  }
}

describe('listUsers', () => {
  it('reduces a roster row to the id and the name a join needs', async () => {
    const http = stubHttp({
      users: [
        {
          id: 407,
          display_name: 'Jake Varrese',
          email: 'jake@example.com',
          avatar_url: 'https://example.com/a.png',
          custom_permissions: ['can_manage_projects']
        }
      ]
    })

    await expect(listUsers({ http: http.client })).resolves.toEqual([
      { id: 407, name: 'Jake Varrese' }
    ])
  })

  it('accepts a bare array as well as the keyed envelope', async () => {
    const http = stubHttp([{ id: 407, display_name: 'Jake Varrese' }])

    await expect(listUsers({ http: http.client })).resolves.toEqual([
      { id: 407, name: 'Jake Varrese' }
    ])
  })

  it('falls back through the other name spellings before giving up on a row', async () => {
    const http = stubHttp({
      users: [
        { id: 1, display_name: 'Display Name', short_display_name: 'Short', first_name: 'First' },
        { id: 2, short_display_name: 'Short Name', first_name: 'First', last_name: 'Last' },
        { id: 3, first_name: 'Grace', last_name: 'Hopper' },
        // A surname on its own is still a name; the composed form must not require both halves.
        { id: 4, last_name: 'Lovelace' },
        { id: 5, email: 'nameless@example.com' }
      ]
    })

    await expect(listUsers({ http: http.client })).resolves.toEqual([
      { id: 1, name: 'Display Name' },
      { id: 2, name: 'Short Name' },
      { id: 3, name: 'Grace Hopper' },
      { id: 4, name: 'Lovelace' },
      { id: 5, name: 'nameless@example.com' }
    ])
  })

  it('drops rows there is nothing to join on or nothing to show', async () => {
    const http = stubHttp({
      users: [
        // `0` is the API's null sentinel, not user zero.
        { id: 0, display_name: 'Sentinel' },
        { id: 6, display_name: '   ' },
        'not a record',
        { display_name: 'No id at all' },
        { id: 7, display_name: 'Grace Hopper' }
      ]
    })

    await expect(listUsers({ http: http.client })).resolves.toEqual([
      { id: 7, name: 'Grace Hopper' }
    ])
  })

  it('keeps archived users, because a task can outlive the account it was assigned to', async () => {
    const http = stubHttp({
      users: [{ id: 8, display_name: 'Departed Colleague', is_archived: true }]
    })

    await expect(listUsers({ http: http.client })).resolves.toEqual([
      { id: 8, name: 'Departed Colleague' }
    ])
  })

  it('asks once with no page parameter, because /users ignores paging and repeats page one', async () => {
    const http = stubHttp({ users: [] })

    await listUsers({ http: http.client })

    expect(http.calls).toEqual([{ path: 'users', options: undefined }])
  })

  it('propagates a transport failure instead of hiding it as an empty roster', async () => {
    // Swallowing a failure is the name directory's job; this read must not pre-empt that decision
    // by making "the roster is empty" and "the roster is unreadable" look identical.
    const denied: AcHttpClient = {
      async request() {
        throw new ActiveCollabApiError('Access denied', 403, true)
      },
      requestBinary(): never {
        throw new Error('requestBinary is not stubbed for the user roster')
      },
      requestStream(): never {
        throw new Error('requestStream is not stubbed for the user roster')
      }
    }

    await expect(listUsers({ http: denied })).rejects.toThrow('Access denied')
  })
})
