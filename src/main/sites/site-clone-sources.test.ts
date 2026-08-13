import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BitbucketRepoListResult, BitbucketRepoSummary } from '../../shared/site-bind-types'
import {
  CLONE_SOURCE_REPO_LIMIT,
  type CloneSourceListResult,
  type CloneSourceProvider
} from '../../shared/site-clone-source-types'

const {
  isBitbucketListingConfigured,
  resolveBitbucketListingCredentials,
  listBitbucketWorkspaceRepos,
  getGithubCloneSourceStatus,
  listGithubCloneSourceRepos,
  discoverSiteCandidates,
  probeRepoRemoteKeys
} = vi.hoisted(() => ({
  isBitbucketListingConfigured: vi.fn(),
  resolveBitbucketListingCredentials: vi.fn(),
  listBitbucketWorkspaceRepos: vi.fn(),
  getGithubCloneSourceStatus: vi.fn(),
  listGithubCloneSourceRepos: vi.fn(),
  discoverSiteCandidates: vi.fn(),
  probeRepoRemoteKeys: vi.fn()
}))

// Each host module owns its own tests. What is under test here is the seam: ordering, the
// per-provider degrade, and the mapping into the shared repo shape. Mocking the modules rather
// than their transports also keeps this hermetic — no keychain, no network, no `gh`.
vi.mock('./bitbucket-listing-auth', () => ({
  isBitbucketListingConfigured,
  resolveBitbucketListingCredentials
}))
vi.mock('./bitbucket-workspace-repos', () => ({
  listBitbucketWorkspaceRepos,
  fetchBitbucketJson: vi.fn()
}))
vi.mock('./github-clone-source', () => ({
  getGithubCloneSourceStatus,
  listGithubCloneSourceRepos
}))
// The candidate scanner and the on-disk remote probe have their own tests. Mocking them keeps this
// file off the real disk while still letting an unadopted folder, and a repo identified only by the
// remote in its config, participate in the exclusion.
vi.mock('./site-candidate-discovery', () => ({ discoverSiteCandidates }))
vi.mock('./repo-remote-probe', () => ({ probeRepoRemoteKeys }))

import {
  listCloneSourceProviders,
  listCloneSourceRepos,
  type CloneSourceStore
} from './site-clone-sources'

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

// Every path sits under a root that does not exist, so root derivation yields nothing and the real
// site-roots-watcher never reaches a real directory — the trick ipc/site-roots.test.ts already uses.
function store(
  repos: { path: string; gitRemoteIdentity?: { canonicalKey: string } | null }[] = [],
  sitePaths: string[] = [],
  extras: Pick<CloneSourceStore, 'pathExists'> = {}
): CloneSourceStore {
  return {
    getRepos: () => repos,
    listSites: () => sitePaths.map((path) => ({ path })),
    getConfiguredSiteRoots: () => [],
    ...extras
  }
}

const stillOnDisk = { pathExists: async (): Promise<boolean> => true }

beforeEach(() => {
  vi.clearAllMocks()
  isBitbucketListingConfigured.mockReturnValue(true)
  resolveBitbucketListingCredentials.mockResolvedValue({ accessToken: 'oauth-token' })
  listBitbucketWorkspaceRepos.mockResolvedValue(bitbucketResult())
  getGithubCloneSourceStatus.mockResolvedValue(GITHUB_CONFIGURED)
  discoverSiteCandidates.mockResolvedValue({
    roots: [],
    primaryRoot: '',
    candidates: [],
    scannedAt: 0,
    truncated: false
  })
  probeRepoRemoteKeys.mockResolvedValue(new Set())
})

describe('listCloneSourceProviders', () => {
  it('always reports both providers in a stable order', async () => {
    expect((await listCloneSourceProviders()).map((provider) => provider.id)).toEqual([
      'bitbucket',
      'github'
    ])
  })

  it('reports a stored OAuth session as configured', async () => {
    expect((await listCloneSourceProviders())[0]).toEqual({
      id: 'bitbucket',
      label: 'Bitbucket',
      configured: true,
      reason: ''
    })
  })

  it('points a signed-out Bitbucket at Settings instead of hiding the row', async () => {
    isBitbucketListingConfigured.mockReturnValue(false)

    const [bitbucket] = await listCloneSourceProviders()
    expect(bitbucket.configured).toBe(false)
    expect(bitbucket.reason).toBe('Connect Bitbucket in Settings → Integrations.')
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
    isBitbucketListingConfigured.mockImplementation(() => {
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
  it('lists Bitbucket with the OAuth session across the signed-in account', async () => {
    await listCloneSourceRepos(store(), 'bitbucket')

    expect(listBitbucketWorkspaceRepos).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: '',
        credentials: { accessToken: 'oauth-token' },
        preferCache: true,
        maxRepos: CLONE_SOURCE_REPO_LIMIT
      })
    )
  })

  it('hands the search term to Bitbucket instead of filtering the page here', async () => {
    await listCloneSourceRepos(store(), 'bitbucket', 'sulo')

    expect(listBitbucketWorkspaceRepos).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'sulo',
        preferCache: false,
        maxRepos: CLONE_SOURCE_REPO_LIMIT
      })
    )
  })

  it('browses with no query when none was given', async () => {
    await listCloneSourceRepos(store(), 'bitbucket')

    expect(listBitbucketWorkspaceRepos).toHaveBeenCalledWith(expect.objectContaining({ query: '' }))
  })

  // GitHub has no host-side filter, so the query must not silently look applied.
  it('does not pretend GitHub searched', async () => {
    listGithubCloneSourceRepos.mockResolvedValue({
      provider: 'github',
      repos: [],
      error: '',
      truncated: false,
      searchesRemotely: false
    })

    const result = await listCloneSourceRepos(store(), 'github', 'sulo')

    expect(result.searchesRemotely).toBe(false)
    expect(listGithubCloneSourceRepos).toHaveBeenCalledWith()
  })

  it('maps Bitbucket repos onto the shared shape, keeping the SSH clone URL', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(bitbucketResult({ repos: [bitbucketRepo()] }))

    expect(await listCloneSourceRepos(store(), 'bitbucket')).toEqual({
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
      truncated: false,
      searchesRemotely: true
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

    const result = await listCloneSourceRepos(store(), 'bitbucket')
    expect(result.repos.map((repo) => repo.fullName)).toEqual(['acme/website'])
  })

  it('falls back to the slug when Bitbucket omitted the full name', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(
      bitbucketResult({ repos: [bitbucketRepo({ fullName: '' })] })
    )

    expect((await listCloneSourceRepos(store(), 'bitbucket')).repos[0].fullName).toBe('website')
  })

  it('reports a missing or unparseable push date as null instead of NaN', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(
      bitbucketResult({
        repos: [bitbucketRepo({ updatedOn: '' }), bitbucketRepo({ updatedOn: 'not a date' })]
      })
    )

    expect(
      (await listCloneSourceRepos(store(), 'bitbucket')).repos.map((repo) => repo.updatedAt)
    ).toEqual([null, null])
  })

  it('surfaces a Bitbucket listing failure as an error on an otherwise valid result', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(
      bitbucketResult({ error: 'Bitbucket rejected the stored App Password.' })
    )

    expect(await listCloneSourceRepos(store(), 'bitbucket')).toEqual({
      provider: 'bitbucket',
      repos: [],
      error: 'Bitbucket rejected the stored App Password.',
      truncated: false,
      searchesRemotely: true
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

    const result = await listCloneSourceRepos(store(), 'bitbucket')
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
      truncated: false,
      searchesRemotely: false
    }
    listGithubCloneSourceRepos.mockResolvedValue(githubResult)

    expect(await listCloneSourceRepos(store(), 'github')).toEqual(githubResult)
    expect(listBitbucketWorkspaceRepos).not.toHaveBeenCalled()
  })

  it('throws for a provider it does not know, so the IPC layer can convert it', async () => {
    await expect(
      listCloneSourceRepos(store(), 'gitlab' as Parameters<typeof listCloneSourceRepos>[1])
    ).rejects.toThrow(TypeError)
  })
})

describe('listCloneSourceRepos exclusions', () => {
  it('drops a repo the store already has, matched on its canonical remote key', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(
      bitbucketResult({
        repos: [
          bitbucketRepo(),
          bitbucketRepo({
            slug: 'api',
            fullName: 'acme/api',
            cloneUrl: 'git@bitbucket.org:acme/api.git'
          })
        ]
      })
    )

    const result = await listCloneSourceRepos(
      store(
        [
          {
            path: '/nowhere/renamed-locally',
            gitRemoteIdentity: { canonicalKey: 'bitbucket.org/acme/website' }
          }
        ],
        [],
        stillOnDisk
      ),
      'bitbucket'
    )

    expect(result.repos.map((repo) => repo.fullName)).toEqual(['acme/api'])
  })

  it('drops a repo whose slug already names a folder the scan found on disk', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(bitbucketResult({ repos: [bitbucketRepo()] }))
    discoverSiteCandidates.mockResolvedValue({
      roots: [],
      primaryRoot: '',
      candidates: [
        { path: '/nowhere/website', displayName: 'website', kind: 'git', isGitRepo: true }
      ],
      scannedAt: 0,
      truncated: false
    })

    expect((await listCloneSourceRepos(store(), 'bitbucket')).repos).toEqual([])
  })

  // The whole point of ordering the two steps: capping first spends the page on rows that are then
  // filtered away, so a user with 400 repos and 200 already here would see 100 instead of 200.
  it('excludes before the cap, so a page the host could fill stays full', async () => {
    const hostRepos = Array.from({ length: CLONE_SOURCE_REPO_LIMIT * 2 }, (_unused, index) =>
      bitbucketRepo({
        slug: `repo-${index}`,
        fullName: `acme/repo-${index}`,
        cloneUrl: `git@bitbucket.org:acme/repo-${index}.git`
      })
    )
    listBitbucketWorkspaceRepos.mockResolvedValue(bitbucketResult({ repos: hostRepos }))
    const alreadyHere = hostRepos
      .filter((_unused, index) => index % 2 === 0)
      .map((repo) => ({ path: `/nowhere/${repo.slug}` }))

    const result = await listCloneSourceRepos(store(alreadyHere, [], stillOnDisk), 'bitbucket')

    expect(result.repos).toHaveLength(CLONE_SOURCE_REPO_LIMIT)
    expect(result.repos.map((repo) => repo.fullName)).toEqual(
      hostRepos.filter((_unused, index) => index % 2 === 1).map((repo) => repo.fullName)
    )
  })

  it('keeps truncated describing the host, not the page that survived filtering', async () => {
    const hostRepos = Array.from({ length: CLONE_SOURCE_REPO_LIMIT + 1 }, (_unused, index) =>
      bitbucketRepo({ slug: `repo-${index}`, fullName: `acme/repo-${index}` })
    )
    listBitbucketWorkspaceRepos.mockResolvedValue(bitbucketResult({ repos: hostRepos }))

    const result = await listCloneSourceRepos(
      store(
        hostRepos.slice(1).map((repo) => ({ path: `/nowhere/${repo.slug}` })),
        [],
        stillOnDisk
      ),
      'bitbucket'
    )

    expect(result.repos.map((repo) => repo.fullName)).toEqual(['acme/repo-0'])
    expect(result.truncated).toBe(true)
  })

  it('filters the GitHub list against the same footprint', async () => {
    listGithubCloneSourceRepos.mockResolvedValue({
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
      truncated: false,
      searchesRemotely: false
    })

    const result = await listCloneSourceRepos(store([], ['/nowhere/api'], stillOnDisk), 'github')

    expect(result.repos).toEqual([])
  })

  // The whole reason the on-disk probe exists: a LocalWP site named after the client, added before
  // gitRemoteIdentity was ever captured. The stored key is absent and the folder name matches no
  // repo, so the config on disk is the only thing left that can identify it.
  it('drops a repo matched only by a remote read off disk', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(
      bitbucketResult({
        repos: [
          bitbucketRepo({
            slug: 'pacific-holdings',
            fullName: 'acme/pacific-holdings',
            cloneUrl: 'https://bitbucket.org/acme/pacific-holdings.git'
          })
        ]
      })
    )
    probeRepoRemoteKeys.mockResolvedValue(new Set(['bitbucket.org/acme/pacific-holdings']))

    const result = await listCloneSourceRepos(
      store([{ path: '/nowhere/117pacific' }], ['/nowhere/117pacific']),
      'bitbucket'
    )

    expect(result.repos).toEqual([])
  })

  it('probes registered repos, configured sites and folders only the scan found', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(bitbucketResult({ repos: [bitbucketRepo()] }))
    discoverSiteCandidates.mockResolvedValue({
      roots: [],
      primaryRoot: '',
      candidates: [
        { path: '/nowhere/unadopted', displayName: 'unadopted', kind: 'localwp', isGitRepo: true }
      ],
      scannedAt: 0,
      truncated: false
    })

    await listCloneSourceRepos(store([{ path: '/nowhere/repo' }], ['/nowhere/site']), 'bitbucket')

    expect(probeRepoRemoteKeys).toHaveBeenCalledTimes(1)
    expect([...probeRepoRemoteKeys.mock.calls[0][0]].sort()).toEqual(['/nowhere/unadopted'])
  })

  it('does not hide a host repo because a deleted site still occupies the store', async () => {
    listBitbucketWorkspaceRepos.mockResolvedValue(
      bitbucketResult({
        repos: [
          bitbucketRepo({
            slug: 'ebes',
            fullName: 'efront_au/ebes',
            cloneUrl: 'git@bitbucket.org:efront_au/ebes.git'
          })
        ]
      })
    )

    const result = await listCloneSourceRepos(
      store([], ['/Users/jakevarrese/Documents/Sites/ebes']),
      'bitbucket'
    )

    expect(result.repos.map((repo) => repo.fullName)).toEqual(['efront_au/ebes'])
  })

  // The footprint costs a directory sweep. Unconfigured Bitbucket returns instantly and must
  // not start that walk; a live connector overlaps it with the host fetch.
  it('skips the footprint when Bitbucket is not configured', async () => {
    isBitbucketListingConfigured.mockReturnValue(false)

    await listCloneSourceRepos(store(), 'bitbucket')

    expect(discoverSiteCandidates).not.toHaveBeenCalled()
    expect(probeRepoRemoteKeys).not.toHaveBeenCalled()
  })
})
