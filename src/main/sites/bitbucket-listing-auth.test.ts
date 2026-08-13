import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getStoredBitbucketCredential, ensureFreshBitbucketAccessToken } = vi.hoisted(() => ({
  getStoredBitbucketCredential: vi.fn(),
  ensureFreshBitbucketAccessToken: vi.fn()
}))

vi.mock('../bitbucket/credential-store', () => ({ getStoredBitbucketCredential }))
vi.mock('../bitbucket/oauth-tokens', () => ({ ensureFreshBitbucketAccessToken }))

import {
  isBitbucketListingConfigured,
  resolveBitbucketListingCredentials
} from './bitbucket-listing-auth'

const OLD_ENV = process.env

describe('Bitbucket listing auth', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV }
    delete process.env.ORCA_BITBUCKET_ACCESS_TOKEN
    delete process.env.ORCA_BITBUCKET_EMAIL
    delete process.env.ORCA_BITBUCKET_API_TOKEN
    getStoredBitbucketCredential.mockReset()
    getStoredBitbucketCredential.mockReturnValue(null)
    ensureFreshBitbucketAccessToken.mockReset()
    ensureFreshBitbucketAccessToken.mockResolvedValue(null)
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  it('treats a stored OAuth session as configured', () => {
    getStoredBitbucketCredential.mockReturnValue({
      refreshToken: 'refresh',
      accessToken: 'access',
      email: '',
      apiToken: '',
      expiresAt: 1,
      account: 'jake'
    })
    expect(isBitbucketListingConfigured()).toBe(true)
  })

  it('resolves the refreshed OAuth access token', async () => {
    ensureFreshBitbucketAccessToken.mockResolvedValue('fresh-oauth')
    await expect(resolveBitbucketListingCredentials()).resolves.toEqual({
      accessToken: 'fresh-oauth'
    })
  })

  it('does not fall back to a leftover App Password file', async () => {
    getStoredBitbucketCredential.mockReturnValue(null)
    await expect(resolveBitbucketListingCredentials()).resolves.toBeNull()
  })
})
