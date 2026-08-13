import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getStoredBitbucketCredentialMock, gitExecFileAsyncMock } = vi.hoisted(() => ({
  getStoredBitbucketCredentialMock: vi.fn(),
  gitExecFileAsyncMock: vi.fn()
}))

vi.mock('./credential-store', () => ({
  getStoredBitbucketCredential: getStoredBitbucketCredentialMock
}))

vi.mock('../git/runner', () => ({
  gitExecFileAsync: gitExecFileAsyncMock
}))

import {
  getBitbucketAuthStatus,
  getBitbucketEnvironmentAuthStatus,
  getBitbucketPullRequestForBranchOrThrow
} from './client'
import { _resetBitbucketRepoRefCache } from './repository-ref'

const OLD_ENV = process.env

function clearBitbucketEnv(): void {
  delete process.env.ORCA_BITBUCKET_EMAIL
  delete process.env.ORCA_BITBUCKET_API_TOKEN
  delete process.env.ORCA_BITBUCKET_ACCESS_TOKEN
}

/** Read the Authorization header the client sent, so precedence is asserted on real bytes. */
function authHeaderOf(fetchMock: ReturnType<typeof vi.fn>): string {
  const init = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined
  return init?.headers?.Authorization ?? ''
}

function basicAuthOf(fetchMock: ReturnType<typeof vi.fn>): string {
  return Buffer.from(authHeaderOf(fetchMock).replace('Basic ', ''), 'base64').toString('utf8')
}

describe('Bitbucket credential resolution', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV }
    process.env.ORCA_BITBUCKET_API_BASE_URL = 'https://api.test.local/2.0'
    clearBitbucketEnv()
    getStoredBitbucketCredentialMock.mockReset()
    getStoredBitbucketCredentialMock.mockReturnValue(null)
    gitExecFileAsyncMock.mockReset()
    gitExecFileAsyncMock.mockResolvedValue({
      stdout: 'git@bitbucket.org:team/repo.git\n',
      stderr: ''
    })
    _resetBitbucketRepoRefCache()
    vi.unstubAllGlobals()
  })

  it('uses the stored credential when no environment variable is set', async () => {
    getStoredBitbucketCredentialMock.mockReturnValue({
      email: 'stored@example.com',
      apiToken: 'stored-token',
      accessToken: ''
    })
    const fetchMock = vi.fn(async () => Response.json({ username: 'stored-user' }))
    vi.stubGlobal('fetch', fetchMock)

    const status = await getBitbucketAuthStatus()

    expect(status).toMatchObject({ configured: true, authenticated: true })
    expect(basicAuthOf(fetchMock)).toBe('stored@example.com:stored-token')
  })

  it('lets an environment variable outrank the stored credential', async () => {
    process.env.ORCA_BITBUCKET_EMAIL = 'env@example.com'
    process.env.ORCA_BITBUCKET_API_TOKEN = 'env-token'
    getStoredBitbucketCredentialMock.mockReturnValue({
      email: 'stored@example.com',
      apiToken: 'stored-token',
      accessToken: ''
    })
    const fetchMock = vi.fn(async () => Response.json({ username: 'env-user' }))
    vi.stubGlobal('fetch', fetchMock)

    await getBitbucketAuthStatus()

    expect(basicAuthOf(fetchMock)).toBe('env@example.com:env-token')
  })

  it('prefers a stored access token over a stored email pair', async () => {
    getStoredBitbucketCredentialMock.mockReturnValue({
      email: '',
      apiToken: '',
      accessToken: 'bearer-token'
    })
    const fetchMock = vi.fn(async () => Response.json({ username: 'bearer-user' }))
    vi.stubGlobal('fetch', fetchMock)

    await getBitbucketAuthStatus()

    expect(authHeaderOf(fetchMock)).toBe('Bearer bearer-token')
  })

  it('never sends an unauthenticated request when nothing is configured', async () => {
    const fetchMock = vi.fn(async () => Response.json({}))
    vi.stubGlobal('fetch', fetchMock)

    const status = await getBitbucketAuthStatus()

    expect(status).toEqual({ configured: false, authenticated: false, account: null })
    // Why: Bitbucket answers an unauthenticated private-repo read with 404, which used to surface
    // as "repo not found" instead of "not signed in".
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports the missing configuration instead of a misleading HTTP 404', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getBitbucketPullRequestForBranchOrThrow('/repo', 'feature/x')).rejects.toThrow(
      /not configured/i
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('separates environment-sourced credentials from stored ones for the settings form', () => {
    expect(getBitbucketEnvironmentAuthStatus()).toEqual({
      configured: false,
      method: null,
      email: null,
      account: null
    })

    process.env.ORCA_BITBUCKET_EMAIL = 'env@example.com'
    process.env.ORCA_BITBUCKET_API_TOKEN = 'env-token'
    expect(getBitbucketEnvironmentAuthStatus()).toEqual({
      configured: true,
      method: 'api-token',
      email: 'env@example.com',
      account: null
    })

    process.env.ORCA_BITBUCKET_ACCESS_TOKEN = 'env-access'
    expect(getBitbucketEnvironmentAuthStatus()).toMatchObject({
      configured: true,
      method: 'access-token',
      email: null
    })
  })
})
