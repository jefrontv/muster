import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as AcHttpModule from './http'
import type { AcHttpArgs } from './http'

// The real http layer is kept and only its transport swapped, so these tests exercise the
// actual form encoding, URL building and HTTP-500-to-error mapping that auth depends on.
const { fetchMock, transport } = vi.hoisted(() => {
  const state = {
    routes: new Map<string, (init: RequestInit) => Response>(),
    requests: [] as { path: string; init: RequestInit }[]
  }
  return {
    transport: state,
    fetchMock: vi.fn(async (input: string, init: RequestInit) => {
      const path = new URL(input).pathname.replace(/^\/api\/v1\//, '')
      state.requests.push({ path, init })
      const handler = state.routes.get(path)
      // A route we never registered stands in for an endpoint this build does not serve.
      return handler ? handler(init) : new Response('', { status: 404 })
    })
  }
})

const { normaliseMock, setCredentialMock } = vi.hoisted(() => ({
  normaliseMock: vi.fn((value: string) => value),
  setCredentialMock: vi.fn()
}))

vi.mock('./http', async (importOriginal) => {
  const actual = await importOriginal<typeof AcHttpModule>()
  return {
    ...actual,
    createAcHttp: (args: AcHttpArgs) =>
      actual.createAcHttp({ ...args, fetchImpl: fetchMock, sleepImpl: async () => undefined })
  }
})

vi.mock('./credential-store', () => ({
  normaliseActiveCollabInstanceUrl: normaliseMock,
  setActiveCollabCredential: setCredentialMock
}))

import { connectActiveCollab, issueActiveCollabToken, resolveActiveCollabUser } from './auth'

const BASE_URL = 'https://projects.efront.com.au'
const EMAIL = 'ada@efront.com.au'
const TOKEN = 'ac-token-secret'

const ADA = { id: 42, display_name: 'Ada Lovelace', email: EMAIL }

function route(path: string, status: number, body: unknown): void {
  transport.routes.set(path, () =>
    body === undefined ? new Response('', { status }) : Response.json(body, { status })
  )
}

function requestFor(path: string): RequestInit | undefined {
  return transport.requests.find((entry) => entry.path === path)?.init
}

function headerOf(init: RequestInit | undefined, name: string): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.[name]
}

beforeEach(() => {
  transport.routes.clear()
  transport.requests.length = 0
  vi.clearAllMocks()
  normaliseMock.mockImplementation((value: string) => value)
})

describe('issueActiveCollabToken', () => {
  it('exchanges the credentials for a token over an unauthenticated form POST', async () => {
    route('issue-token', 200, { is_ok: true, token: TOKEN })

    const result = await issueActiveCollabToken({
      baseUrl: BASE_URL,
      email: EMAIL,
      password: 'hunter2'
    })

    expect(result).toEqual({ ok: true, token: TOKEN })
    const init = requestFor('issue-token')
    expect(init?.method).toBe('POST')
    expect(headerOf(init, 'Content-Type')).toBe('application/x-www-form-urlencoded')
    // No token exists yet, so the request must not carry an auth header.
    expect(headerOf(init, 'X-Angie-AuthApiToken')).toBeUndefined()
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      username: EMAIL,
      password: 'hunter2',
      client_name: 'Muster',
      client_vendor: 'muster'
    })
  })

  it('surfaces the API message from the HTTP 500 that a wrong password produces', async () => {
    // ActiveCollab answers bad credentials with 500, not 401; the body carries the real reason.
    route('issue-token', 500, {
      type: 'Angie\\Authentication\\Exception',
      message: 'Invalid username or password',
      code: 401
    })

    const result = await issueActiveCollabToken({
      baseUrl: BASE_URL,
      email: EMAIL,
      password: 'wrong'
    })

    expect(result).toEqual({ ok: false, message: 'Invalid username or password' })
    // An auth-shaped 500 must not be replayed as a transient server fault.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a missing token rather than reporting success without one', async () => {
    route('issue-token', 200, { is_ok: true })

    const result = await issueActiveCollabToken({
      baseUrl: BASE_URL,
      email: EMAIL,
      password: 'hunter2'
    })

    expect(result).toEqual({
      ok: false,
      message:
        'ActiveCollab accepted the sign-in but returned no API token. Check the instance URL.'
    })
  })
})

describe('resolveActiveCollabUser', () => {
  it('sends the raw token in the X-Angie-AuthApiToken header', async () => {
    route('user-session', 200, { logged_user_id: 42 })
    route('users/42', 200, { single: ADA })

    await resolveActiveCollabUser({ baseUrl: BASE_URL, token: TOKEN })

    expect(headerOf(requestFor('user-session'), 'X-Angie-AuthApiToken')).toBe(TOKEN)
  })

  it.each([
    ['logged_user_id', { logged_user_id: 42 }],
    ['user_id', { user_id: 42 }],
    ['id', { id: 42 }],
    ['logged_user.id', { logged_user: { id: 42 } }]
  ])('accepts the "%s" whoami shape and hydrates from users/{id}', async (_name, session) => {
    route('user-session', 200, session)
    route('users/42', 200, { single: ADA })

    await expect(resolveActiveCollabUser({ baseUrl: BASE_URL, token: TOKEN })).resolves.toEqual({
      id: 42,
      name: 'Ada Lovelace',
      email: EMAIL
    })
  })

  it('uses an inline logged_user object instead of spending a users/{id} request', async () => {
    route('user-session', 200, { logged_user_id: 42, logged_user: ADA })

    const identity = await resolveActiveCollabUser({ baseUrl: BASE_URL, token: TOKEN })

    expect(identity).toEqual({ id: 42, name: 'Ada Lovelace', email: EMAIL })
    expect(transport.requests.map((entry) => entry.path)).toEqual(['user-session'])
  })

  it('falls back to a case-insensitive /users email match when user-session is unavailable', async () => {
    route('users', 200, [
      { id: 7, display_name: 'Grace', email: 'grace@efront.com.au' },
      { id: 42, first_name: 'Ada', last_name: 'Lovelace', email: 'Ada@EFront.Com.AU' }
    ])

    const identity = await resolveActiveCollabUser({
      baseUrl: BASE_URL,
      token: TOKEN,
      email: EMAIL
    })

    expect(identity).toEqual({ id: 42, name: 'Ada Lovelace', email: 'Ada@EFront.Com.AU' })
  })

  it('keeps the session id when /users is admin-gated, because it still addresses task reads', async () => {
    route('user-session', 200, { logged_user_id: 42 })
    route('users/42', 403, { message: 'Forbidden' })
    route('users', 403, { message: 'Forbidden' })

    await expect(
      resolveActiveCollabUser({ baseUrl: BASE_URL, token: TOKEN, email: EMAIL })
    ).resolves.toEqual({ id: 42, name: EMAIL, email: EMAIL })
  })

  it('throws a clear error when no source can establish the identity', async () => {
    route('users', 403, { message: 'Forbidden' })

    await expect(
      resolveActiveCollabUser({ baseUrl: BASE_URL, token: TOKEN, email: EMAIL })
    ).rejects.toThrow('could not determine which user the token belongs to')
  })
})

describe('connectActiveCollab', () => {
  it('stores the token with the resolved identity and returns only the connection', async () => {
    route('issue-token', 200, { is_ok: true, token: TOKEN })
    route('user-session', 200, { logged_user_id: 42, logged_user: ADA })
    normaliseMock.mockReturnValue('https://projects.efront.com.au')

    const result = await connectActiveCollab({
      baseUrl: 'https://projects.efront.com.au/',
      email: EMAIL,
      password: 'hunter2'
    })

    expect(normaliseMock).toHaveBeenCalledWith('https://projects.efront.com.au/')
    expect(setCredentialMock).toHaveBeenCalledWith({
      instanceUrl: 'https://projects.efront.com.au',
      token: TOKEN,
      userId: 42,
      userName: 'Ada Lovelace',
      userEmail: EMAIL
    })
    expect(result).toEqual({
      ok: true,
      connection: {
        instanceUrl: 'https://projects.efront.com.au',
        userId: 42,
        userName: 'Ada Lovelace',
        userEmail: EMAIL
      }
    })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  it('writes nothing when the credentials are rejected', async () => {
    route('issue-token', 500, {
      type: 'Angie\\Authentication\\Exception',
      message: 'Invalid username or password'
    })

    const result = await connectActiveCollab({
      baseUrl: BASE_URL,
      email: EMAIL,
      password: 'wrong'
    })

    expect(result).toEqual({ ok: false, message: 'Invalid username or password' })
    expect(setCredentialMock).not.toHaveBeenCalled()
  })

  it('writes nothing when the token is valid but its owner cannot be identified', async () => {
    route('issue-token', 200, { is_ok: true, token: TOKEN })
    route('users', 403, { message: 'Forbidden' })

    const result = await connectActiveCollab({
      baseUrl: BASE_URL,
      email: EMAIL,
      password: 'hunter2'
    })

    expect(result.ok).toBe(false)
    expect(setCredentialMock).not.toHaveBeenCalled()
  })
})
