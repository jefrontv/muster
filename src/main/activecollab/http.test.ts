import { describe, expect, it } from 'vitest'
import {
  ActiveCollabApiError,
  createAcHttp,
  redactAcToken,
  type AcFetch,
  type AcHttpArgs,
  type AcHttpClient
} from './http'

const BASE = 'https://projects.efront.com.au'
const TOKEN = '1-abcdefSECRETtoken'

type Call = { url: string; init: RequestInit }

type Harness = {
  calls: Call[]
  sleeps: number[]
  http: AcHttpClient
}

/** Factories, not Responses: a retry consumes a fresh body on each attempt. */
function harness(factories: (() => Response)[], overrides: Partial<AcHttpArgs> = {}): Harness {
  const calls: Call[] = []
  const sleeps: number[] = []
  let index = 0
  const fetchImpl: AcFetch = async (url, init) => {
    calls.push({ url, init })
    const factory = factories[Math.min(index, factories.length - 1)]
    index += 1
    return factory()
  }
  const http = createAcHttp({
    baseUrl: BASE,
    token: TOKEN,
    fetchImpl,
    sleepImpl: async (ms) => {
      sleeps.push(ms)
    },
    ...overrides
  })
  return { calls, sleeps, http }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): () => Response {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers }
    })
}

function headersOf(call: Call): Record<string, string> {
  return call.init.headers as Record<string, string>
}

async function rejection(promise: Promise<unknown>): Promise<ActiveCollabApiError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ActiveCollabApiError)
    return error as ActiveCollabApiError
  }
  throw new Error('expected the request to reject')
}

describe('request headers', () => {
  it('sends the raw token with no scheme prefix', async () => {
    const { calls, http } = harness([json({ id: 1 })])
    await http.request('user-session')

    expect(headersOf(calls[0])['X-Angie-AuthApiToken']).toBe(TOKEN)
    expect(headersOf(calls[0]).Accept).toBe('application/json')
    expect(JSON.stringify(headersOf(calls[0]))).not.toContain('Bearer')
    expect(headersOf(calls[0]).Authorization).toBeUndefined()
  })

  it('omits the auth header entirely before a token exists', async () => {
    const { calls, http } = harness([json({ is_ok: true })], { token: null })
    await http.request('issue-token', { method: 'POST', form: { username: 'a@b.com' } })

    expect(headersOf(calls[0])['X-Angie-AuthApiToken']).toBeUndefined()
  })

  it('sends a JSON body as application/json', async () => {
    const { calls, http } = harness([json({ id: 1 })])
    await http.request('projects/3790/tasks/1', { method: 'PUT', body: { name: 'Renamed' } })

    expect(headersOf(calls[0])['Content-Type']).toBe('application/json')
    expect(calls[0].init.body).toBe('{"name":"Renamed"}')
  })

  it('form-encodes issue-token the way ActiveCollab requires', async () => {
    const { calls, http } = harness([json({ is_ok: true, token: TOKEN })], { token: null })
    await http.request('issue-token', {
      method: 'POST',
      form: { username: 'jake@efront.com.au', password: 'p w&x', client_name: 'Muster' }
    })

    expect(headersOf(calls[0])['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(calls[0].init.body).toBe(
      'username=jake%40efront.com.au&password=p+w%26x&client_name=Muster'
    )
    expect(calls[0].init.method).toBe('POST')
  })
})

describe('base url normalisation', () => {
  it('appends /api/v1/ when the instance url carries no path', async () => {
    const { calls, http } = harness([json([])])
    await http.request('projects/3790/tasks')

    expect(calls[0].url).toBe('https://projects.efront.com.au/api/v1/projects/3790/tasks')
  })

  it('keeps an existing path instead of doubling the prefix', async () => {
    const { calls, http } = harness([json([])], {
      baseUrl: 'https://projects.efront.com.au/api/v1'
    })
    await http.request('projects/3790/tasks')

    expect(calls[0].url).toBe('https://projects.efront.com.au/api/v1/projects/3790/tasks')
  })

  it('joins without a double slash however the two halves are spelled', async () => {
    const { calls, http } = harness([json([])], { baseUrl: 'https://projects.efront.com.au/' })
    await http.request('/projects/3790/tasks', { query: { page: 2, ignored: undefined } })

    expect(calls[0].url).toBe('https://projects.efront.com.au/api/v1/projects/3790/tasks?page=2')
  })
})

describe('pagination headers', () => {
  it('reads the totals that exist only in headers', async () => {
    const { http } = harness([
      json([{ id: 1 }], 200, {
        'X-Angie-PaginationTotalItems': '317',
        'X-Angie-PaginationCurrentPage': '2',
        'X-Angie-PaginationItemsPerPage': '100'
      })
    ])
    const response = await http.request<{ id: number }[]>('projects/3790/tasks')

    expect(response.data).toEqual([{ id: 1 }])
    expect(response.totalItems).toBe(317)
    expect(response.page).toBe(2)
    expect(response.perPage).toBe(100)
  })

  it('reports nulls rather than guessing when the headers are absent', async () => {
    const { http } = harness([json([])])
    const response = await http.request('projects/3790/tasks')

    expect(response).toMatchObject({ totalItems: null, page: null, perPage: null })
  })

  it('returns null data for an empty body', async () => {
    const { http } = harness([() => new Response(null, { status: 204 })])

    expect((await http.request('projects/3790/tasks/1')).data).toBeNull()
  })
})

describe('error classification', () => {
  it('flags 401 and 403 as auth errors', async () => {
    for (const status of [401, 403]) {
      const { http } = harness([json({ message: 'Nope' }, status)])
      const error = await rejection(http.request('user-session'))

      expect(error.status).toBe(status)
      expect(error.isAuthError).toBe(true)
      expect(error.message).toBe('Nope')
    }
  })

  it('flags an auth-shaped 500 as an auth error and does NOT retry it', async () => {
    // ActiveCollab answers a wrong password with 500; replaying it forever
    // instead of reporting it is the bug this guards.
    const { calls, http } = harness([
      json(
        {
          type: 'Angie\\Authentication\\Exception\\InvalidAuthenticationParams',
          message: 'Invalid username and password combination',
          code: 0
        },
        500
      )
    ])
    const error = await rejection(http.request('user-session'))

    expect(error.isAuthError).toBe(true)
    expect(error.message).toBe('Invalid username and password combination')
    expect(error.apiType).toBe('Angie\\Authentication\\Exception\\InvalidAuthenticationParams')
    expect(calls).toHaveLength(1)
  })

  it('treats a generic 500 as transient: not an auth error, and retried', async () => {
    const { calls, sleeps, http } = harness([json({ message: 'Database is away' }, 500)])
    const error = await rejection(http.request('projects/3790/tasks'))

    expect(error.isAuthError).toBe(false)
    expect(error.message).toBe('Database is away')
    expect(calls).toHaveLength(3)
    expect(sleeps).toEqual([250, 750])
  })

  it('falls back to the status when the body carries no message', async () => {
    const { http } = harness([() => new Response('<html>bad gateway</html>', { status: 400 })])
    const error = await rejection(http.request('projects/3790/tasks'))

    expect(error.message).toBe('ActiveCollab request failed with 400')
    expect(error.apiMessage).toBeNull()
  })

  it('recovers when a retried request succeeds', async () => {
    const { calls, http } = harness([json({ message: 'Bad gateway' }, 502), json({ id: 1 })])

    expect((await http.request<{ id: number }>('projects/3790/tasks')).data).toEqual({ id: 1 })
    expect(calls).toHaveLength(2)
  })
})

describe('retry policy', () => {
  it('honours a numeric Retry-After on 429', async () => {
    const { sleeps, http } = harness([json({ message: 'Slow down' }, 429, { 'retry-after': '7' })])
    await rejection(http.request('projects/3790/tasks'))

    expect(sleeps).toEqual([7000, 7000])
  })

  it('honours an HTTP-date Retry-After against the injected clock', async () => {
    const now = Date.parse('2026-07-27T00:00:00Z')
    const { sleeps, http } = harness(
      [
        json({ message: 'Slow down' }, 429, {
          'retry-after': new Date(now + 12_000).toUTCString()
        })
      ],
      { nowImpl: () => now }
    )
    await rejection(http.request('projects/3790/tasks'))

    expect(sleeps).toEqual([12_000, 12_000])
  })

  it('honours a Retry-After on a 503 as well as a 429', async () => {
    const { sleeps, http } = harness([json({ message: 'Down' }, 503, { 'retry-after': '5' })])
    await rejection(http.request('projects/3790/tasks'))

    expect(sleeps).toEqual([5000, 5000])
  })

  it('clamps an oversized Retry-After to the cap, and spends that budget only once', async () => {
    const { calls, sleeps, http } = harness([json({}, 429, { 'retry-after': '86400' })])
    await rejection(http.request('projects/3790/tasks'))

    // A day becomes the 60s cap, and the cap is the budget for the WHOLE request: the second 429
    // ends it rather than stalling the caller for another minute on top.
    expect(sleeps).toEqual([60_000])
    expect(calls).toHaveLength(2)
  })

  it('falls back to bounded backoff when a 429 carries no Retry-After at all', async () => {
    const { calls, sleeps, http } = harness([json({ message: 'Slow down' }, 429)])
    await rejection(http.request('projects/3790/tasks'))

    expect(sleeps).toEqual([250, 750])
    expect(calls).toHaveLength(3)
  })

  it('ignores a Retry-After date that has already passed', async () => {
    const now = Date.parse('2026-07-27T00:00:00Z')
    const { sleeps, http } = harness(
      [json({}, 429, { 'retry-after': new Date(now - 30_000).toUTCString() })],
      { nowImpl: () => now }
    )
    await rejection(http.request('projects/3790/tasks'))

    expect(sleeps).toEqual([250, 750])
  })

  it('ignores an unusable Retry-After and falls back to bounded backoff', async () => {
    const { sleeps, http } = harness([json({}, 503, { 'retry-after': 'whenever' })])
    await rejection(http.request('projects/3790/tasks'))

    expect(sleeps).toEqual([250, 750])
  })

  it('never replays a non-GET, however transient the failure looks', async () => {
    for (const method of ['POST', 'PUT'] as const) {
      const { calls, sleeps, http } = harness([json({ message: 'Gateway timeout' }, 504)])
      await rejection(http.request('projects/3790/tasks', { method, body: { name: 'x' } }))

      expect(calls).toHaveLength(1)
      expect(sleeps).toEqual([])
    }
  })

  it('does not retry a plain 404', async () => {
    const { calls, http } = harness([json({ message: 'Not found' }, 404)])
    await rejection(http.request('projects/3790/tasks/1'))

    expect(calls).toHaveLength(1)
  })
})

describe('token redaction', () => {
  it('strips the token from a message that embeds it in a URL', () => {
    const leaked = `https://projects.efront.com.au/api/v1/files/9?token=${TOKEN}&size=--WIDTH--`

    expect(redactAcToken(leaked, TOKEN)).toBe(
      'https://projects.efront.com.au/api/v1/files/9?token=***&size=--WIDTH--'
    )
    expect(redactAcToken(leaked, TOKEN)).not.toContain(TOKEN)
  })

  it('leaves the value alone when there is no token yet', () => {
    expect(redactAcToken('nothing to hide', null)).toBe('nothing to hide')
    expect(redactAcToken('nothing to hide', '')).toBe('nothing to hide')
  })

  it('redacts a percent-encoded token too', () => {
    const token = 'tok en/1'

    expect(redactAcToken(`?t=${encodeURIComponent(token)}`, token)).toBe('?t=***')
  })

  it('redacts the token out of a thrown error message', async () => {
    const { http } = harness([
      json(
        {
          message: `Failed to proxy https://projects.efront.com.au/api/v1/x?token=${TOKEN}`,
          type: 'Angie\\Error'
        },
        400
      )
    ])
    const error = await rejection(http.request('projects/3790/tasks'))

    expect(error.message).not.toContain(TOKEN)
    expect(error.message).toContain('token=***')
    expect(error.apiMessage).not.toContain(TOKEN)
  })

  it('redacts the token out of a transport failure', async () => {
    const { http } = harness([], {
      fetchImpl: async () => {
        throw new Error(`connect ECONNREFUSED https://projects.efront.com.au/x?token=${TOKEN}`)
      }
    })
    const error = await rejection(http.request('projects/3790/tasks'))

    expect(error.status).toBe(0)
    expect(error.isAuthError).toBe(false)
    expect(error.message).not.toContain(TOKEN)
  })

  it('lets an abort stay an abort rather than a server fault', async () => {
    const controller = new AbortController()
    const { http } = harness([], {
      fetchImpl: async () => {
        controller.abort()
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
    })

    await expect(
      http.request('projects/3790/tasks', { signal: controller.signal })
    ).rejects.not.toBeInstanceOf(ActiveCollabApiError)
  })
})
