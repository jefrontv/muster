import { beforeEach, describe, expect, it } from 'vitest'
import { ActiveCollabApiError, type AcHttpClient } from './http'
import { acNameDirectory, resetAcNameDirectoryCache } from './name-directory'
import {
  acProjectMembers,
  resetAcProjectMembersCache,
  type AcProjectMembersLoader
} from './project-members'

type Route = { data: unknown } | ActiveCollabApiError

type StubHttp = {
  client: AcHttpClient
  /** Requests per path, so a test can assert the membership cost rather than just its result. */
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
        throw new Error('requestBinary is not stubbed for project members')
      },
      requestStream(): never {
        throw new Error('requestStream is not stubbed for project members')
      }
    }
  }
}

const PROJECTS: Route = { data: [{ id: 5937, name: '30494 - Orleton OM', avatarUrl: null }] }

const USERS: Route = {
  data: {
    users: [
      { id: 407, display_name: 'Jake Varrese' },
      { id: 12, display_name: 'Ada Lovelace' },
      { id: 88, display_name: 'Alan Turing' }
    ]
  }
}

/** The shape verified against projects.efront.com.au 8.0.31: bare ids under `single.members`. */
const SINGLE_MEMBERS: Route = { data: { single: { id: 5937, members: [12, 407] } } }

const HEALTHY: Record<string, Route> = {
  projects: PROJECTS,
  users: USERS,
  'projects/5937': SINGLE_MEMBERS
}

function loaderFor(
  http: AcHttpClient,
  over: { userId?: number; nowImpl?: () => number } = {}
): AcProjectMembersLoader {
  const identity = { instanceUrl: 'https://projects.example.com', userId: over.userId ?? 42 }
  return acProjectMembers({
    http,
    names: acNameDirectory({ http, ...identity, nowImpl: over.nowImpl }),
    ...identity,
    nowImpl: over.nowImpl
  })
}

beforeEach(() => {
  resetAcNameDirectoryCache()
  resetAcProjectMembersCache()
})

describe('membership payload', () => {
  it('reads the bare user ids ActiveCollab 8.0.31 sends under single.members', async () => {
    const http = stubHttp(HEALTHY)

    // Alan is on the instance roster but not on the project, so he must not come back.
    await expect(loaderFor(http.client)(5937)).resolves.toEqual([
      { id: 12, name: 'Ada Lovelace', avatarUrl: null },
      { id: 407, name: 'Jake Varrese', avatarUrl: null }
    ])
  })

  it('reads a top-level members array, the envelope the reference client also accepts', async () => {
    const http = stubHttp({ ...HEALTHY, 'projects/5937': { data: { members: [12, 407] } } })

    await expect(loaderFor(http.client)(5937)).resolves.toEqual([
      { id: 12, name: 'Ada Lovelace', avatarUrl: null },
      { id: 407, name: 'Jake Varrese', avatarUrl: null }
    ])
  })

  it('prefers single.members when an instance sends both envelopes', async () => {
    const http = stubHttp({
      ...HEALTHY,
      'projects/5937': { data: { single: { members: [12] }, members: [88] } }
    })

    await expect(loaderFor(http.client)(5937)).resolves.toEqual([
      { id: 12, name: 'Ada Lovelace', avatarUrl: null }
    ])
  })

  it('accepts member entries that arrive as objects rather than bare ids', async () => {
    const http = stubHttp({
      ...HEALTHY,
      'projects/5937': { data: { single: { members: [{ id: 88 }, { id: 12 }] } } }
    })

    await expect(loaderFor(http.client)(5937)).resolves.toEqual([
      { id: 12, name: 'Ada Lovelace', avatarUrl: null },
      { id: 88, name: 'Alan Turing', avatarUrl: null }
    ])
  })

  it('drops the 0 sentinel and anything that is not a usable id', async () => {
    const http = stubHttp({
      ...HEALTHY,
      'projects/5937': { data: { single: { members: [0, null, '12', 1.5, 407] } } }
    })

    await expect(loaderFor(http.client)(5937)).resolves.toEqual([
      { id: 407, name: 'Jake Varrese', avatarUrl: null }
    ])
  })

  it('sorts by name, so a capped suggestion list is stable between keystrokes', async () => {
    const http = stubHttp({
      ...HEALTHY,
      'projects/5937': { data: { single: { members: [407, 88, 12] } } }
    })

    await expect(loaderFor(http.client)(5937)).resolves.toEqual([
      { id: 12, name: 'Ada Lovelace', avatarUrl: null },
      { id: 88, name: 'Alan Turing', avatarUrl: null },
      { id: 407, name: 'Jake Varrese', avatarUrl: null }
    ])
  })

  it('drops a member the roster cannot name rather than inventing a label for them', async () => {
    // 902 is a real member the roster has no row for: a synthetic "User 902" would be a menu entry
    // nobody can search for that writes nonsense into the comment if they pick it.
    const http = stubHttp({
      ...HEALTHY,
      'projects/5937': { data: { single: { members: [902, 12] } } }
    })

    await expect(loaderFor(http.client)(5937)).resolves.toEqual([
      { id: 12, name: 'Ada Lovelace', avatarUrl: null }
    ])
  })
})

describe('degradation', () => {
  it('answers an empty list when the project read fails, never rejecting', async () => {
    const http = stubHttp({
      ...HEALTHY,
      'projects/5937': new ActiveCollabApiError('Access denied', 403, true)
    })

    // Empty is the agreed signal to fall back to the roster; a rejection would surface a reconnect
    // prompt over a comment box whose connection is fine.
    await expect(loaderFor(http.client)(5937)).resolves.toEqual([])
  })

  it('answers an empty list when the roster is refused, so no member can be named', async () => {
    const http = stubHttp({
      ...HEALTHY,
      users: new ActiveCollabApiError('Access denied', 403, true)
    })

    await expect(loaderFor(http.client)(5937)).resolves.toEqual([])
  })

  it('answers an empty list for a project that genuinely has no members', async () => {
    const http = stubHttp({ ...HEALTHY, 'projects/5937': { data: { single: { members: [] } } } })

    await expect(loaderFor(http.client)(5937)).resolves.toEqual([])
  })

  it('retries a failed membership within 30s rather than pinning empty for the full window', async () => {
    let members: Route = new ActiveCollabApiError('Service unavailable', 503, false)
    const http = stubHttp(HEALTHY)
    const routed: AcHttpClient = {
      request: async <T>(path: string, options?: never) => {
        if (path === 'projects/5937') {
          http.counts[path] = (http.counts[path] ?? 0) + 1
          if (members instanceof ActiveCollabApiError) {
            throw members
          }
          return { data: members.data as T, totalItems: null, page: null, perPage: null }
        }
        return http.client.request<T>(path, options)
      },
      requestBinary: http.client.requestBinary,
      requestStream: http.client.requestStream
    }
    let clock = 1_000_000
    const loader = acProjectMembers({
      http: routed,
      names: acNameDirectory({
        http: routed,
        instanceUrl: 'https://projects.example.com',
        userId: 42
      }),
      instanceUrl: 'https://projects.example.com',
      userId: 42,
      nowImpl: () => clock
    })

    await expect(loader(5937)).resolves.toEqual([])
    members = SINGLE_MEMBERS

    // Still inside the short retry window: the failed entry stands.
    clock += 29_000
    await expect(loader(5937)).resolves.toEqual([])
    expect(http.counts['projects/5937']).toBe(1)

    clock += 1_001
    await expect(loader(5937)).resolves.toHaveLength(2)
    expect(http.counts['projects/5937']).toBe(2)
  })
})

describe('request cost', () => {
  it('reads a membership once per project, and a second project separately', async () => {
    const http = stubHttp({
      ...HEALTHY,
      'projects/3790': { data: { single: { members: [88] } } }
    })
    const loader = loaderFor(http.client)

    await loader(5937)
    await loader(5937)
    await loader(3790)

    expect(http.counts).toEqual({ 'projects/5937': 1, 'projects/3790': 1, users: 1, projects: 1 })
  })

  it('shares one in-flight read between callers that arrive together', async () => {
    let open: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      open = resolve
    })
    const http = stubHttp(HEALTHY, gate)
    const loader = loaderFor(http.client)

    const first = loader(5937)
    const second = loader(5937)
    open()
    await Promise.all([first, second])

    expect(http.counts['projects/5937']).toBe(1)
    expect(first).toBe(second)
  })

  it('serves a second operation from cache even though it built a fresh client', async () => {
    const first = stubHttp(HEALTHY)
    const second = stubHttp(HEALTHY)

    // The ipc layer builds a new AcHttpClient per call by design; the cache is keyed on the
    // credential, so the second call must not pay for the membership again.
    await loaderFor(first.client)(5937)
    await expect(loaderFor(second.client)(5937)).resolves.toHaveLength(2)

    expect(second.counts).toEqual({})
  })

  it('refetches once the TTL window has passed', async () => {
    const http = stubHttp(HEALTHY)
    let clock = 1_000_000
    const loader = loaderFor(http.client, { nowImpl: () => clock })

    await loader(5937)
    clock += 5 * 60_000 - 1
    await loader(5937)
    expect(http.counts['projects/5937']).toBe(1)

    clock += 1
    await loader(5937)
    expect(http.counts['projects/5937']).toBe(2)
  })

  it('drops every cached membership on reset, so a disconnect cannot leak one forward', async () => {
    const http = stubHttp(HEALTHY)
    const loader = loaderFor(http.client)

    await loader(5937)
    resetAcProjectMembersCache()
    await loader(5937)

    expect(http.counts['projects/5937']).toBe(2)
  })
})

describe('credential isolation', () => {
  it('never serves one account the membership cached for another', async () => {
    const mine = stubHttp(HEALTHY)
    const theirs = stubHttp({
      ...HEALTHY,
      users: { data: { users: [{ id: 12, display_name: 'Their Colleague' }] } },
      'projects/5937': { data: { single: { members: [12] } } }
    })

    await expect(loaderFor(mine.client, { userId: 42 })(5937)).resolves.toEqual([
      { id: 12, name: 'Ada Lovelace', avatarUrl: null },
      { id: 407, name: 'Jake Varrese', avatarUrl: null }
    ])
    await expect(loaderFor(theirs.client, { userId: 99 })(5937)).resolves.toEqual([
      { id: 12, name: 'Their Colleague', avatarUrl: null }
    ])

    // Each identity paid for its own read; neither was skipped as "already cached".
    expect(mine.counts['projects/5937']).toBe(1)
    expect(theirs.counts['projects/5937']).toBe(1)
  })
})
