import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getBitbucketOAuthConsumer,
  isBitbucketOAuthAvailable,
  parseDotEnvLocal
} from './oauth-config'

const OLD_ENV = process.env

describe('Bitbucket OAuth consumer config', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV }
    delete process.env.ORCA_BITBUCKET_OAUTH_CLIENT_ID
    delete process.env.ORCA_BITBUCKET_OAUTH_CLIENT_SECRET
  })

  afterEach(() => {
    process.env = OLD_ENV
  })

  it('is unavailable when the consumer env is missing', () => {
    expect(getBitbucketOAuthConsumer(process.env)).toBeNull()
    expect(isBitbucketOAuthAvailable(process.env)).toBe(false)
  })

  it('reads the consumer from the process env', () => {
    process.env.ORCA_BITBUCKET_OAUTH_CLIENT_ID = 'key'
    process.env.ORCA_BITBUCKET_OAUTH_CLIENT_SECRET = 'secret'
    expect(getBitbucketOAuthConsumer(process.env)).toEqual({
      clientId: 'key',
      clientSecret: 'secret'
    })
  })

  it('parses a gitignored .env.local body', () => {
    expect(
      parseDotEnvLocal(
        '# comment\nORCA_BITBUCKET_OAUTH_CLIENT_ID=from-file\nORCA_BITBUCKET_OAUTH_CLIENT_SECRET="file-secret"\n'
      )
    ).toEqual({
      ORCA_BITBUCKET_OAUTH_CLIENT_ID: 'from-file',
      ORCA_BITBUCKET_OAUTH_CLIENT_SECRET: 'file-secret'
    })
  })
})
