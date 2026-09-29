import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getStoredBitbucketCredentialMock, setStoredBitbucketCredentialMock } = vi.hoisted(() => ({
  getStoredBitbucketCredentialMock: vi.fn(),
  setStoredBitbucketCredentialMock: vi.fn()
}))

vi.mock('./credential-store', () => ({
  getStoredBitbucketCredential: getStoredBitbucketCredentialMock,
  setStoredBitbucketCredential: setStoredBitbucketCredentialMock
}))

import { _resetBitbucketAuthLossForTests, wireBitbucketAuthLoss } from './auth-loss'
import { bitbucketRequestJson } from './bitbucket-http'
import { BITBUCKET_OAUTH_TOKEN_URL } from './oauth-config'
import { _resetBitbucketOAuthRefreshForTests } from './oauth-tokens'

const OLD_ENV = process.env

const API_TOKEN_CREDENTIAL = {
  email: 'me@example.com',
  apiToken: 'saved-token',
  accessToken: '',
  refreshToken: '',
  expiresAt: 0,
  account: ''
}

const EXPIRED_OAUTH_CREDENTIAL = {
  email: '',
  apiToken: '',
  accessToken: 'old-access',
  refreshToken: 'saved-refresh',
  expiresAt: 1,
  account: 'me'
}

type FetchRoute = (url: string) => Response | Promise<Response>

function stubFetch(route: FetchRoute): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string | URL) => route(String(input)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('Bitbucket auth loss detection', () => {
  const onChange = vi.fn()

  beforeEach(() => {
    process.env = { ...OLD_ENV }
    process.env.ORCA_BITBUCKET_API_BASE_URL = 'https://api.test.local/2.0'
    process.env.ORCA_BITBUCKET_OAUTH_CLIENT_ID = 'client'
    process.env.ORCA_BITBUCKET_OAUTH_CLIENT_SECRET = 'secret'
    delete process.env.ORCA_BITBUCKET_ACCESS_TOKEN
    delete process.env.ORCA_BITBUCKET_EMAIL
    delete process.env.ORCA_BITBUCKET_API_TOKEN
    getStoredBitbucketCredentialMock.mockReset()
    setStoredBitbucketCredentialMock.mockReset()
    _resetBitbucketOAuthRefreshForTests()
    _resetBitbucketAuthLossForTests()
    onChange.mockReset()
    wireBitbucketAuthLoss({ shouldReport: () => true, onChange })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = OLD_ENV
  })

  it('reports a 401 on the saved credential once across repeated polls', async () => {
    getStoredBitbucketCredentialMock.mockReturnValue(API_TOKEN_CREDENTIAL)
    stubFetch(() => new Response('', { status: 401 }))

    await bitbucketRequestJson('/user')
    await bitbucketRequestJson('/user')
    await expect(bitbucketRequestJson('/user', {}, true)).rejects.toThrow(/HTTP 401/)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ reason: 'token-rejected' }))
  })

  it('names the refused refresh rather than the 401 that follows it', async () => {
    getStoredBitbucketCredentialMock.mockReturnValue(EXPIRED_OAUTH_CREDENTIAL)
    stubFetch((url) =>
      url === BITBUCKET_OAUTH_TOKEN_URL
        ? Response.json(
            { error: 'invalid_grant', error_description: 'Invalid refresh_token' },
            { status: 400 }
          )
        : new Response('', { status: 401 })
    )

    await bitbucketRequestJson('/user')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ reason: 'refresh-rejected' }))
    expect(setStoredBitbucketCredentialMock).not.toHaveBeenCalled()
  })

  it('ignores a token endpoint outage', async () => {
    getStoredBitbucketCredentialMock.mockReturnValue(EXPIRED_OAUTH_CREDENTIAL)
    stubFetch((url) =>
      url === BITBUCKET_OAUTH_TOKEN_URL
        ? new Response('', { status: 503 })
        : Response.json({ username: 'me' })
    )

    await expect(bitbucketRequestJson('/user')).resolves.toEqual({ username: 'me' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores network failures', async () => {
    getStoredBitbucketCredentialMock.mockReturnValue(EXPIRED_OAUTH_CREDENTIAL)
    stubFetch(() => {
      throw new TypeError('fetch failed')
    })

    await expect(bitbucketRequestJson('/user')).resolves.toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('treats a 403 as a permission gap, not a lost sign-in', async () => {
    getStoredBitbucketCredentialMock.mockReturnValue(API_TOKEN_CREDENTIAL)
    stubFetch(() => new Response('', { status: 403 }))

    await bitbucketRequestJson('/repositories/team/repo/pipelines/')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('sends nothing and reports nothing when Bitbucket was never connected', async () => {
    getStoredBitbucketCredentialMock.mockReturnValue(null)
    const fetchMock = stubFetch(() => new Response('', { status: 401 }))

    await bitbucketRequestJson('/user')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })
})
