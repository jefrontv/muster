import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BitbucketRepoListResult, BitbucketRepoSummary } from '../../shared/site-bind-types'
import {
  CLONE_SOURCE_REPO_LIMIT,
  type CloneSourceListResult,
  type CloneSourceProvider
} from '../../shared/site-clone-source-types'

const {
  getBitbucketCredentialRecord,
  getBitbucketCredentials,
  getBitbucketCredentialStatus,
  listBitbucketWorkspaceRepos,
  getGithubCloneSourceStatus,
  listGithubCloneSourceRepos
} = vi.hoisted(() => ({
  getBitbucketCredentialRecord: vi.fn(),
  getBitbucketCredentials: vi.fn(),
  getBitbucketCredentialStatus: vi.fn(),
  listBitbucketWorkspaceRepos: vi.fn(),
  getGithubCloneSourceStatus: vi.fn(),
  listGithubCloneSourceRepos: vi.fn()
}))

// Each host module owns its own tests. What is under test here is the seam: ordering, the
// per-provider degrade, and the mapping into the shared repo shape. Mocking the modules rather
// than their transports also keeps this hermetic — no keychain, no network, no `gh`.
vi.mock('./bitbucket-credential-store', () => ({
  getBitbucketCredentialRecord,
  getBitbucketCredentials,
  getBitbucketCredentialStatus
}))
vi.mock('./bitbucket-workspace-repos', () => ({
  listBitbucketWorkspaceRepos,
  fetchBitbucketJson: vi.fn()
}))
vi.mock('./github-clone-source', () => ({
  getGithubCloneSourceStatus,
  listGithubCloneSourceRepos
}))

import { listCloneSourceProviders, listCloneSourceRepos } from './site-clone-sources'

const GITHUB_CONFIGURED: CloneSourceProvider = {
  id: 'github',
  label: 'GitHub',
  configured: true,
  reason: ''
}

function bitbucketRepo(overrides: Partial<BitbucketRepoSummary> = {}): BitbucketRepoSummary {
  return {
    slug: 'website',
    fullName: 'acme/website',
    cloneUrl: 'git@bitbucket.org:acme/website.git',
    description: 'Marketing site',
    updatedOn: '2024-05-01T10:00:00+00:00',
    ...overrides
  }
}

function bitbucketResult(
  overrides: Partial<BitbucketRepoListResult> = {}
): BitbucketRepoListResult {
  return {
    configured: true,
    workspace: 'acme',
    repos: [],
    fromCache: false,
    error: '',
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getBitbucketCredentialStatus.mockReturnValue({
    configured: true,
    username: 'jake',
    workspace: 'acme'
  })
  getBitbucketCredentialRecord.mockReturnValue({
    username: 'jake',
    appPassword: 'secret',
    workspace: 'acme'
  })
  getBitbucketCredentials.mockReturnValue({ username: 'jake', appPassword: 'secret' })
  listBitbucketWorkspaceRepos.mockResolvedValue(bitbucketResult())
  getGithubCloneSourceStatus.mockResolvedValue(GITHUB_CONFIGURED)
})

describe('listCloneSourceProviders', () => {
  it('always reports both providers in a stable order', async () => {
    expect((await listCloneSourceProviders()).map((provider) => provider.id)).toEqual([
      'bitbucket',
      'github'
    ])
  })

  it('reports a stored credential and workspace as configured', async () => {
    expect((await listCloneSourceProviders())[0]).toEqual({
      id: 'bitbucket',
      label: 'Bitbucket',
      configured: true,
      reason: ''
    })
  })

  it('points a credential-less Bitbucket at Settings instead of hiding the row', async () => {
    getBitbucketCredentialStatus.mockReturnValue({
      configured: false,
      username: '',
      workspace: ''
    })
    getBitbucketCredentialRecord.mockReturnValue(null)

    const [bitbucket] = await listCloneSourceProviders()
    expect(bitbucket.configured).toBe(false)
    expect(bitbucket.reason).toBe('Add a Bitbucket App Password in Settings → Integrations.')
  })

  // A password with no workspace cannot list anything, so it must not read as configured.
  it('treats a stored credential with no workspace as unconfigured, with its own reason', async () => {
    getBitbucketCredentialRecord.mockReturnValue({
      username: 'jake',
      appPassword: 'secret',
      workspace: ''
    })

    const [bitbucket] = await listCloneSourceProviders()
    expect(bitbucket.configured).toBe(false)
    expect(bitbucket.reason).toBe('Set a Bitbucket workspace in Settings → Integrations.')
  })

  it('delegates the GitHub row verbatim to the gh-backed module', async () => {
    getGithubCloneSourceStatus.mockResolvedValue({
      id: 'github',
      label: 'GitHub',
      configured: false,
      reason: 'Run gh auth login to connect GitHub.'
    })

    expect((await listCloneSourceProviders())[1]).toEqual({
      id: 'github',
      label: 'GitHub',
      configured: false,
      reason: 'Run gh auth login to connect GitHub.'
    })
  })

  it('degrades a throwing GitHub probe to unconfigured while Bitbucket still reports', async () => {
    getGithubCloneSourceStatus.mockRejectedValue(new Error('gh exited with code 1'))

    expect(await listCloneSourceProviders()).toEqual([
      { id: 'bitbucket', label: 'Bitbucket', configured: true, reason: '' },
      { id: 'github', label: 'GitHub', configured: false, reason: 'gh exited with code 1' }
    ])
  })

  it('degrades a throwing Bitbucket probe while GitHub still reports', async () => {
    getBitbucketCredentialStatus.mockImplementation(() => {
      throw new Error('Keychain is locked')
    })

    expect(await listCloneSourceProviders()).toEqual([
      { id: 'bitbucket', label: 'Bitbucket', configured: false, reason: 'Keychain is locked' },
      GITHUB_CONFIGURED
    ])
  })

  it('keeps a non-Error rejection readable rather than surfacing "[object Object]"', async () => {
    getGithubCloneSourceStatus.mockRejectedValue('spawn ENOENT')

    expect((await listCloneSourceProviders())[1].reason).toBe('spawn ENOENT')
  })
})

describe('listCloneSourceRepos', () => {
  it('lists Bitbucket against the stored workspace and credentials', async () => {
    await listCloneSourceRepos('bitbucket')

    expect(listBitbucketWorkspaceRepos).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: 'acme',
        credentials: { username: 'jake', appPassword: 'secret' }
      })
    )
  })

  it('maps Bitbucket repos onto the shared shape, keeping the SSH clone URL', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(bitbucketResult({ repos: [bitbucketRepo()] }))

    expect(await listCloneSourceRepos('bitbucket')).toEqual({
      provider: 'bitbucket',
      repos: [
        {
          provider: 'bitbucket',
          fullName: 'acme/website',
          cloneUrl: 'git@bitbucket.org:acme/website.git',
          description: 'Marketing site',
          updatedAt: Date.parse('2024-05-01T10:00:00+00:00'),
          isPrivate: true
        }
      ],
      error: '',
      truncated: false
    })
  })

  // The picker's only action is "clone this", so a repo with no clone link is un-actionable.
  it('omits a repo Bitbucket gave no clone URL for rather than listing it unclonable', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(
      bitbucketResult({
        repos: [
          bitbucketRepo({ slug: 'no-url', fullName: 'acme/no-url', cloneUrl: '' }),
          bitbucketRepo()
        ]
      })
    )

    const result = await listCloneSourceRepos('bitbucket')
    expect(result.repos.map((repo) => repo.fullName)).toEqual(['acme/website'])
  })

  it('falls back to the slug when Bitbucket omitted the full name', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(
      bitbucketResult({ repos: [bitbucketRepo({ fullName: '' })] })
    )

    expect((await listCloneSourceRepos('bitbucket')).repos[0].fullName).toBe('website')
  })

  it('reports a missing or unparseable push date as null instead of NaN', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(
      bitbucketResult({
        repos: [bitbucketRepo({ updatedOn: '' }), bitbucketRepo({ updatedOn: 'not a date' })]
      })
    )

    expect((await listCloneSourceRepos('bitbucket')).repos.map((repo) => repo.updatedAt)).toEqual([
      null,
      null
    ])
  })

  it('surfaces a Bitbucket listing failure as an error on an otherwise valid result', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(
      bitbucketResult({ error: 'Bitbucket rejected the stored App Password.' })
    )

    expect(await listCloneSourceRepos('bitbucket')).toEqual({
      provider: 'bitbucket',
      repos: [],
      error: 'Bitbucket rejected the stored App Password.',
      truncated: false
    })
  })

  it('caps the Bitbucket list and flags it truncated', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(
      bitbucketResult({
        repos: Array.from({ length: CLONE_SOURCE_REPO_LIMIT + 1 }, (_unused, index) =>
          bitbucketRepo({ slug: `repo-${index}`, fullName: `acme/repo-${index}` })
        )
      })
    )

    const result = await listCloneSourceRepos('bitbucket')
    expect(result.repos).toHaveLength(CLONE_SOURCE_REPO_LIMIT)
    expect(result.truncated).toBe(true)
  })

  it('delegates GitHub listing to the gh-backed module', async () => {
    const githubResult: CloneSourceListResult = {
      provider: 'github',
      repos: [
        {
          provider: 'github',
          fullName: 'acme/api',
          cloneUrl: 'git@github.com:acme/api.git',
          description: '',
          updatedAt: null,
          isPrivate: false
        }
      ],
      error: '',
      truncated: false
    }
    listGithubCloneSourceRepos.mockResolvedValue(githubResult)

    expect(await listCloneSourceRepos('github')).toBe(githubResult)
    expect(listBitbucketWorkspaceRepos).not.toHaveBeenCalled()
  })

  it('throws for a provider it does not know, so the IPC layer can convert it', async () => {
    await expect(
      listCloneSourceRepos('gitlab' as Parameters<typeof listCloneSourceRepos>[0])
    ).rejects.toThrow(TypeError)
  })
})
