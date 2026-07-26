import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ghExecFileAsyncMock } = vi.hoisted(() => ({ ghExecFileAsyncMock: vi.fn() }))

vi.mock('../git/runner', () => ({
  ghExecFileAsync: ghExecFileAsyncMock
}))

import { CLONE_SOURCE_REPO_LIMIT } from '../../shared/site-clone-source-types'
import { getGithubCloneSourceStatus, listGithubCloneSourceRepos } from './github-clone-source'

// Real `gh auth status` output; the login parse lives in auth-diagnose and keys off these labels.
const LOGGED_IN_STATUS = `github.com
  ✓ Logged in to github.com account octocat (keyring)
  - Active account: true
  - Git operations protocol: ssh
  - Token scopes: 'gist', 'read:org', 'repo'
`

const LOGGED_OUT_STATUS = `You are not logged into any GitHub hosts. To log in, run: gh auth login`

type GhStub = { stdout?: string; stderr?: string } | Error

function respond(stub: GhStub): Promise<{ stdout: string; stderr: string }> {
  if (stub instanceof Error) {
    return Promise.reject(stub)
  }
  return Promise.resolve({ stdout: stub.stdout ?? '', stderr: stub.stderr ?? '' })
}

/** Route the two gh invocations this module makes; defaults are logged-in with an empty account. */
function stubGh(stubs: { auth?: GhStub; repoList?: GhStub } = {}): void {
  ghExecFileAsyncMock.mockImplementation((args: string[]) => {
    if (args[0] === 'auth') {
      return respond(stubs.auth ?? { stderr: LOGGED_IN_STATUS })
    }
    if (args[0] === 'repo') {
      return respond(stubs.repoList ?? { stdout: '[]' })
    }
    return Promise.reject(new Error(`unexpected gh invocation: ${args.join(' ')}`))
  })
}

function repoListArgs(): string[] {
  const call = ghExecFileAsyncMock.mock.calls.find(
    (args: unknown[]) => Array.isArray(args[0]) && (args[0] as string[])[0] === 'repo'
  )
  return (call?.[0] as string[]) ?? []
}

function execError(message: string, fields: { stderr?: string; code?: string } = {}): Error {
  return Object.assign(new Error(message), fields)
}

beforeEach(() => {
  ghExecFileAsyncMock.mockReset()
})

describe('getGithubCloneSourceStatus', () => {
  it('reports configured when gh has an active login', async () => {
    stubGh({ auth: { stderr: LOGGED_IN_STATUS } })

    await expect(getGithubCloneSourceStatus()).resolves.toEqual({
      id: 'github',
      label: 'GitHub',
      configured: true,
      reason: ''
    })
  })

  it('reports not configured with a login instruction when gh is logged out', async () => {
    // gh exits non-zero when logged out but still prints the diagnostic to stderr.
    stubGh({ auth: execError('Command failed: gh auth status', { stderr: LOGGED_OUT_STATUS }) })

    const status = await getGithubCloneSourceStatus()

    expect(status.configured).toBe(false)
    expect(status.reason).toBe('Run gh auth login to connect GitHub.')
  })

  it('reports not configured with an install instruction when gh is missing', async () => {
    stubGh({ auth: execError('spawn gh ENOENT', { code: 'ENOENT' }) })

    const status = await getGithubCloneSourceStatus()

    expect(status.configured).toBe(false)
    expect(status.reason).toBe('GitHub CLI (gh) is not installed.')
  })
})

describe('listGithubCloneSourceRepos', () => {
  it('requests one repo beyond the cap so truncation is visible without a second call', async () => {
    stubGh()

    await listGithubCloneSourceRepos()

    expect(repoListArgs()).toEqual([
      'repo',
      'list',
      '--json',
      'nameWithOwner,sshUrl,url,description,pushedAt,isPrivate',
      '--limit',
      String(CLONE_SOURCE_REPO_LIMIT + 1)
    ])
  })

  it('parses the listing and sorts it newest push first', async () => {
    stubGh({
      repoList: {
        stdout: JSON.stringify([
          {
            nameWithOwner: 'octocat/older',
            sshUrl: 'git@github.com:octocat/older.git',
            url: 'https://github.com/octocat/older',
            description: 'An older repo',
            pushedAt: '2024-01-02T03:04:05Z',
            isPrivate: false
          },
          {
            nameWithOwner: 'octocat/newer',
            sshUrl: 'git@github.com:octocat/newer.git',
            url: 'https://github.com/octocat/newer',
            description: '',
            pushedAt: '2025-06-07T08:09:10Z',
            isPrivate: true
          }
        ])
      }
    })

    const result = await listGithubCloneSourceRepos()

    expect(result.error).toBe('')
    expect(result.truncated).toBe(false)
    expect(result.repos).toEqual([
      {
        provider: 'github',
        fullName: 'octocat/newer',
        cloneUrl: 'git@github.com:octocat/newer.git',
        description: '',
        updatedAt: Date.parse('2025-06-07T08:09:10Z'),
        isPrivate: true
      },
      {
        provider: 'github',
        fullName: 'octocat/older',
        cloneUrl: 'git@github.com:octocat/older.git',
        description: 'An older repo',
        updatedAt: Date.parse('2024-01-02T03:04:05Z'),
        isPrivate: false
      }
    ])
  })

  it('sorts repos with no usable push date last, tie-broken by name', async () => {
    stubGh({
      repoList: {
        stdout: JSON.stringify([
          { nameWithOwner: 'octocat/zeta-undated', sshUrl: 'git@github.com:octocat/zeta.git' },
          {
            nameWithOwner: 'octocat/alpha-undated',
            sshUrl: 'git@github.com:octocat/alpha.git',
            pushedAt: 'not-a-date'
          },
          {
            nameWithOwner: 'octocat/dated',
            sshUrl: 'git@github.com:octocat/dated.git',
            pushedAt: '2020-01-01T00:00:00Z'
          }
        ])
      }
    })

    const result = await listGithubCloneSourceRepos()

    expect(result.repos.map((repo) => repo.fullName)).toEqual([
      'octocat/dated',
      'octocat/alpha-undated',
      'octocat/zeta-undated'
    ])
    expect(result.repos[1].updatedAt).toBeNull()
    expect(result.repos[2].updatedAt).toBeNull()
  })

  it('prefers the ssh url and falls back to https', async () => {
    stubGh({
      repoList: {
        stdout: JSON.stringify([
          {
            nameWithOwner: 'octocat/both',
            sshUrl: 'git@github.com:octocat/both.git',
            url: 'https://github.com/octocat/both',
            pushedAt: '2025-01-02T00:00:00Z'
          },
          {
            nameWithOwner: 'octocat/https-only',
            sshUrl: '',
            url: 'https://github.com/octocat/https-only',
            pushedAt: '2025-01-01T00:00:00Z'
          }
        ])
      }
    })

    const result = await listGithubCloneSourceRepos()

    expect(result.repos.map((repo) => repo.cloneUrl)).toEqual([
      'git@github.com:octocat/both.git',
      'https://github.com/octocat/https-only'
    ])
  })

  it('omits a repo that has neither an ssh nor an https url', async () => {
    stubGh({
      repoList: {
        stdout: JSON.stringify([
          { nameWithOwner: 'octocat/unclonable', sshUrl: '', url: '' },
          { nameWithOwner: 'octocat/clonable', sshUrl: 'git@github.com:octocat/clonable.git' }
        ])
      }
    })

    const result = await listGithubCloneSourceRepos()

    expect(result.repos.map((repo) => repo.fullName)).toEqual(['octocat/clonable'])
    expect(result.error).toBe('')
  })

  it('skips malformed entries instead of failing the whole list', async () => {
    stubGh({
      repoList: {
        stdout: JSON.stringify([
          null,
          'octocat/not-an-object',
          { nameWithOwner: 42, sshUrl: 'git@github.com:octocat/wrong-type.git' },
          { sshUrl: 'git@github.com:octocat/nameless.git' },
          {
            nameWithOwner: 'octocat/good',
            sshUrl: 'git@github.com:octocat/good.git',
            description: 7,
            isPrivate: 'yes'
          }
        ])
      }
    })

    const result = await listGithubCloneSourceRepos()

    expect(result.error).toBe('')
    expect(result.repos).toEqual([
      {
        provider: 'github',
        fullName: 'octocat/good',
        cloneUrl: 'git@github.com:octocat/good.git',
        description: '',
        updatedAt: null,
        isPrivate: false
      }
    ])
  })

  it('reports an error when gh returns something that is not JSON', async () => {
    stubGh({ repoList: { stdout: 'gh: unexpected banner\n' } })

    const result = await listGithubCloneSourceRepos()

    expect(result).toEqual({
      provider: 'github',
      repos: [],
      error: 'Could not read the repository list returned by gh.',
      truncated: false
    })
  })

  it('reports an error when gh returns JSON that is not a list', async () => {
    stubGh({ repoList: { stdout: '{"message":"Not Found"}' } })

    expect((await listGithubCloneSourceRepos()).error).toBe(
      'Could not read the repository list returned by gh.'
    )
  })

  it('reports the gh failure instead of throwing', async () => {
    stubGh({
      repoList: execError('Command failed: gh repo list', {
        stderr: 'HTTP 403: Resource protected by organization SAML enforcement\nmore detail'
      })
    })

    const result = await listGithubCloneSourceRepos()

    expect(result.repos).toEqual([])
    expect(result.truncated).toBe(false)
    expect(result.error).toBe(
      'Could not list GitHub repositories: HTTP 403: Resource protected by organization SAML enforcement'
    )
  })

  it('marks the list truncated and caps it when gh fills the limit+1 page', async () => {
    const entries = Array.from({ length: CLONE_SOURCE_REPO_LIMIT + 1 }, (_, index) => ({
      nameWithOwner: `octocat/repo-${String(index).padStart(3, '0')}`,
      sshUrl: `git@github.com:octocat/repo-${index}.git`,
      pushedAt: new Date(Date.UTC(2025, 0, 1) + index * 1000).toISOString(),
      isPrivate: false
    }))
    stubGh({ repoList: { stdout: JSON.stringify(entries) } })

    const result = await listGithubCloneSourceRepos()

    expect(result.truncated).toBe(true)
    expect(result.repos).toHaveLength(CLONE_SOURCE_REPO_LIMIT)
    // Newest survives the cap, oldest is the one dropped.
    expect(result.repos[0].fullName).toBe(
      `octocat/repo-${String(CLONE_SOURCE_REPO_LIMIT).padStart(3, '0')}`
    )
    expect(result.repos.some((repo) => repo.fullName === 'octocat/repo-000')).toBe(false)
  })

  it('returns an empty list with no error when gh is not connected', async () => {
    stubGh({ auth: execError('Command failed: gh auth status', { stderr: LOGGED_OUT_STATUS }) })

    const result = await listGithubCloneSourceRepos()

    expect(result).toEqual({ provider: 'github', repos: [], error: '', truncated: false })
    // Not connected must not cost a repo query.
    expect(repoListArgs()).toEqual([])
  })
})
