import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ReposModule from './bitbucket-workspace-repos'
import type { BitbucketApiResponse } from './bitbucket-workspace-repos'
import type { BitbucketRepoListResult, BitbucketRepoSummary } from '../../shared/site-bind-types'
import { fetchBitbucketJson, listBitbucketWorkspaceRepos } from './bitbucket-workspace-repos'
import { getBitbucketCredentialRecord } from './bitbucket-credential-store'
import { resolveBitbucketListingCredentials } from './bitbucket-listing-auth'
import { resolveSiteSetupCloneTargets } from './site-setup-clone-targets'

// The credential store is mocked whole (no importOriginal) so `electron`'s safeStorage never loads.
vi.mock('./bitbucket-credential-store', () => ({ getBitbucketCredentialRecord: vi.fn() }))
vi.mock('./bitbucket-listing-auth', () => ({
  resolveBitbucketListingCredentials: vi.fn()
}))

// The lister keeps its real helpers — the SSH-preference test drives the genuine implementation with
// only the HTTP binding stubbed, since that is where the clone-URL choice actually happens.
vi.mock('./bitbucket-workspace-repos', async (importOriginal) => ({
  ...(await importOriginal<typeof ReposModule>()),
  listBitbucketWorkspaceRepos: vi.fn(),
  fetchBitbucketJson: vi.fn()
}))

const recordMock = vi.mocked(getBitbucketCredentialRecord)
const listingAuthMock = vi.mocked(resolveBitbucketListingCredentials)
const listMock = vi.mocked(listBitbucketWorkspaceRepos)
const fetchMock = vi.mocked(fetchBitbucketJson)

const RECORD = { username: 'jake@example.com', appPassword: 'ATBBsecret', workspace: 'efront_au' }

function repo(slug: string, overrides: Partial<BitbucketRepoSummary> = {}): BitbucketRepoSummary {
  return {
    slug,
    fullName: `efront_au/${slug}`,
    cloneUrl: `git@bitbucket.org:efront_au/${slug}.git`,
    description: '',
    updatedOn: '2026-07-01T00:00:00Z',
    ...overrides
  }
}

function listed(
  repos: BitbucketRepoSummary[],
  overrides: Partial<BitbucketRepoListResult> = {}
): BitbucketRepoListResult {
  return {
    configured: true,
    workspace: 'efront_au',
    repos,
    fromCache: false,
    error: '',
    ...overrides
  }
}

function apiPage(slug: string, clone: { name: string; href: string }[]): BitbucketApiResponse {
  return {
    ok: true,
    status: 200,
    body: {
      size: 1,
      values: [{ slug, full_name: `efront_au/${slug}`, links: { clone } }]
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  recordMock.mockReturnValue(RECORD)
  listingAuthMock.mockResolvedValue({ accessToken: 'oauth-token' })
})

describe('connector configuration', () => {
  it('reports no connector without an error when nothing is stored', async () => {
    recordMock.mockReturnValue(null)
    listingAuthMock.mockResolvedValue(null)

    expect(await resolveSiteSetupCloneTargets('adamson-eoi')).toEqual({
      connectorConfigured: false,
      targets: [],
      error: ''
    })
    expect(listMock).not.toHaveBeenCalled()
  })

  it('lists across the signed-in account when no workspace is stored', async () => {
    recordMock.mockReturnValue({ ...RECORD, workspace: '' })
    listMock.mockResolvedValue(listed([repo('adamson-eoi')], { workspace: '' }))

    const result = await resolveSiteSetupCloneTargets('adamson-eoi')

    expect(result.connectorConfigured).toBe(true)
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: '',
        credentials: { accessToken: 'oauth-token' }
      })
    )
  })
})

describe('matching', () => {
  it('ranks an exact slug match first and marks it exact', async () => {
    listMock.mockResolvedValue(
      listed([repo('adamson-eoi-legacy'), repo('other-site'), repo('adamson-eoi')])
    )

    const result = await resolveSiteSetupCloneTargets('adamson-eoi')

    expect(result.connectorConfigured).toBe(true)
    expect(result.error).toBe('')
    expect(result.targets).toEqual([
      {
        provider: 'bitbucket',
        fullName: 'efront_au/adamson-eoi',
        cloneUrl: 'git@bitbucket.org:efront_au/adamson-eoi.git',
        exactMatch: true
      },
      {
        provider: 'bitbucket',
        fullName: 'efront_au/adamson-eoi-legacy',
        cloneUrl: 'git@bitbucket.org:efront_au/adamson-eoi-legacy.git',
        exactMatch: false
      }
    ])
  })

  it('accepts the workspace/slug form and lists that workspace', async () => {
    listMock.mockResolvedValue(listed([repo('adamson-eoi')], { workspace: 'other_ws' }))

    const result = await resolveSiteSetupCloneTargets('other_ws/adamson-eoi')

    expect(listMock.mock.calls[0]?.[0].workspace).toBe('other_ws')
    expect(result.targets).toHaveLength(1)
    expect(result.targets[0]?.exactMatch).toBe(true)
  })

  it('matches case-insensitively but does not call it an exact match', async () => {
    listMock.mockResolvedValue(listed([repo('adamson-eoi-archive'), repo('adamson-eoi')]))

    const result = await resolveSiteSetupCloneTargets('Adamson-EOI')

    expect(result.targets.map((target) => target.fullName)).toEqual([
      'efront_au/adamson-eoi',
      'efront_au/adamson-eoi-archive'
    ])
    expect(result.targets.every((target) => target.exactMatch)).toBe(false)
  })

  it('falls back to substring matches when nothing matches by name', async () => {
    listMock.mockResolvedValue(listed([repo('unrelated'), repo('adamson-eoi-staging')]))

    const result = await resolveSiteSetupCloneTargets('adamson')

    expect(result.targets).toEqual([
      {
        provider: 'bitbucket',
        fullName: 'efront_au/adamson-eoi-staging',
        cloneUrl: 'git@bitbucket.org:efront_au/adamson-eoi-staging.git',
        exactMatch: false
      }
    ])
  })

  it('caps the returned targets at ten', async () => {
    listMock.mockResolvedValue(
      listed(Array.from({ length: 15 }, (_, index) => repo(`adamson-eoi-${index}`)))
    )

    const result = await resolveSiteSetupCloneTargets('adamson-eoi')

    expect(result.targets).toHaveLength(10)
  })

  it('skips repositories the connector reports with no clone remote', async () => {
    listMock.mockResolvedValue(listed([repo('adamson-eoi', { cloneUrl: '' })]))

    expect((await resolveSiteSetupCloneTargets('adamson-eoi')).targets).toEqual([])
  })
})

describe('failures', () => {
  it('returns the listing error while still reporting the connector as configured', async () => {
    listMock.mockResolvedValue(
      listed([], {
        error: 'Bitbucket rejected the stored credentials (HTTP 401).'
      })
    )

    expect(await resolveSiteSetupCloneTargets('adamson-eoi')).toEqual({
      connectorConfigured: true,
      targets: [],
      error: 'Bitbucket rejected the stored credentials (HTTP 401).'
    })
  })

  it('does not rank against an incomplete list when the listing partly failed', async () => {
    listMock.mockResolvedValue(
      listed([repo('adamson-eoi')], { error: 'Could not reach Bitbucket: getaddrinfo ENOTFOUND' })
    )

    const result = await resolveSiteSetupCloneTargets('adamson-eoi')

    expect(result.targets).toEqual([])
    expect(result.error).toBe('Could not reach Bitbucket: getaddrinfo ENOTFOUND')
  })
})

describe('clone URL preference (real lister, stubbed HTTP)', () => {
  it('prefers SSH and falls back to HTTPS when the repo has no SSH remote', async () => {
    const actual = await vi.importActual<typeof ReposModule>('./bitbucket-workspace-repos')
    listMock.mockImplementation(actual.listBitbucketWorkspaceRepos)

    actual.clearBitbucketRepoCache()
    fetchMock.mockResolvedValue(
      apiPage('adamson-eoi', [
        { name: 'https', href: 'https://bitbucket.org/efront_au/adamson-eoi.git' },
        { name: 'ssh', href: 'git@bitbucket.org:efront_au/adamson-eoi.git' }
      ])
    )
    const withSsh = await resolveSiteSetupCloneTargets('adamson-eoi')
    expect(withSsh.targets[0]?.cloneUrl).toBe('git@bitbucket.org:efront_au/adamson-eoi.git')

    actual.clearBitbucketRepoCache()
    fetchMock.mockResolvedValue(
      apiPage('adamson-eoi', [
        { name: 'https', href: 'https://bitbucket.org/efront_au/adamson-eoi.git' }
      ])
    )
    const httpsOnly = await resolveSiteSetupCloneTargets('adamson-eoi')
    expect(httpsOnly.targets[0]?.cloneUrl).toBe('https://bitbucket.org/efront_au/adamson-eoi.git')
  })
})
