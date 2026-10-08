import { describe, expect, it, vi } from 'vitest'
import { getCommitPipelines, normalizeCommitShas } from './commit-pipelines'

const SHA = 'a'.repeat(40)
const REPO = { workspace: 'efront_au', repoSlug: 'site' }

describe('normalizeCommitShas', () => {
  it('keeps full hashes only, deduped and capped at the panel size', () => {
    const many = Array.from({ length: 80 }, (_, index) => index.toString(16).padStart(40, '0'))

    expect(normalizeCommitShas([SHA, SHA, 'abc123', 42, null])).toEqual([SHA])
    expect(normalizeCommitShas(many)).toHaveLength(50)
    expect(normalizeCommitShas('not-an-array')).toEqual([])
  })
})

describe('getCommitPipelines', () => {
  it('routes a Bitbucket origin to the pipelines lookup with the listed commits', async () => {
    const getBitbucketPipelines = vi.fn(async () => ({
      available: true as const,
      runsBySha: {}
    }))

    await getCommitPipelines({ repoPath: '/repo', connectionId: 'ssh-1' }, [SHA], {
      resolveBitbucketRepo: async () => REPO,
      getBitbucketPipelines
    })

    expect(getBitbucketPipelines).toHaveBeenCalledWith(REPO, [SHA])
  })

  it('hides the column for a remote no supported forge recognises', async () => {
    const result = await getCommitPipelines({ repoPath: '/repo' }, [SHA], {
      resolveBitbucketRepo: async () => null,
      resolveGitHubRepo: async () => null
    })

    expect(result).toEqual({ available: false, reason: 'no-provider' })
  })

  it('falls through to GitHub checks with the WSL options the history read used', async () => {
    const githubRepo = { owner: 'efront', repo: 'site', host: 'github.com' }
    const getGitHubChecks = vi.fn(async () => ({ available: true as const, runsBySha: {} }))

    await getCommitPipelines(
      { repoPath: '/repo', localGitExecOptions: { wslDistro: 'Ubuntu' } },
      [SHA],
      {
        resolveBitbucketRepo: async () => null,
        resolveGitHubRepo: async () => githubRepo,
        getGitHubChecks
      }
    )

    expect(getGitHubChecks).toHaveBeenCalledWith(
      { repoPath: '/repo', connectionId: undefined, localGitOptions: { wslDistro: 'Ubuntu' } },
      githubRepo,
      [SHA]
    )
  })

  it('spends no API call when there are no commits to look up', async () => {
    const getBitbucketPipelines = vi.fn()

    const result = await getCommitPipelines({ repoPath: '/repo' }, [], {
      resolveBitbucketRepo: async () => REPO,
      getBitbucketPipelines
    })

    expect(result).toEqual({ available: true, runsBySha: {} })
    expect(getBitbucketPipelines).not.toHaveBeenCalled()
  })
})
