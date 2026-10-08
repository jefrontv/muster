import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetGitLabCommitPipelinesInFlight,
  getGitLabCommitPipelines,
  mapGitLabPipelineStatus,
  matchGitLabPipelinesToCommits
} from './commit-pipelines'

const PROJECT = { host: 'gitlab.com', path: 'efront/site' }
const CONTEXT = { repoPath: '/repo' }
const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

function glabError(stderr: string): Error {
  return Object.assign(new Error('glab failed'), { stderr })
}

describe('mapGitLabPipelineStatus', () => {
  it('collapses GitLab statuses onto the shared vocabulary', () => {
    expect(mapGitLabPipelineStatus('running')).toBe('running')
    expect(mapGitLabPipelineStatus('waiting_for_resource')).toBe('pending')
    expect(mapGitLabPipelineStatus('success')).toBe('success')
    expect(mapGitLabPipelineStatus('failed')).toBe('failure')
    expect(mapGitLabPipelineStatus('canceled')).toBe('stopped')
    expect(mapGitLabPipelineStatus('skipped')).toBe('skipped')
    expect(mapGitLabPipelineStatus('manual')).toBe('paused')
    expect(mapGitLabPipelineStatus('something-new')).toBeNull()
  })
})

describe('matchGitLabPipelinesToCommits', () => {
  it('keeps the newest pipeline per commit and ignores unlisted commits', () => {
    const matched = matchGitLabPipelinesToCommits(
      [
        { id: 30, sha: SHA_A, status: 'failed', web_url: 'https://gitlab.com/p/-/pipelines/30' },
        { id: 29, sha: SHA_A, status: 'success' },
        { id: 28, sha: SHA_B, status: 'success' }
      ],
      [SHA_A]
    )

    expect(Object.keys(matched)).toEqual([SHA_A])
    expect(matched[SHA_A]).toMatchObject({
      runNumber: 30,
      status: 'failure',
      url: 'https://gitlab.com/p/-/pipelines/30'
    })
  })
})

describe('getGitLabCommitPipelines', () => {
  beforeEach(() => {
    _resetGitLabCommitPipelinesInFlight()
  })

  it('lists one page of pipelines for the project in a single call', async () => {
    const runApi = vi.fn(async () => JSON.stringify([{ id: 1, sha: SHA_A, status: 'running' }]))

    const result = await getGitLabCommitPipelines(CONTEXT, PROJECT, [SHA_A], { runApi })

    expect(runApi).toHaveBeenCalledTimes(1)
    expect(runApi).toHaveBeenCalledWith(CONTEXT, [
      'api',
      'projects/efront%2Fsite/pipelines?per_page=30&order_by=id&sort=desc'
    ])
    expect(result).toMatchObject({ available: true, runsBySha: { [SHA_A]: { status: 'running' } } })
  })

  it('treats a signed-out glab and a missing scope as unavailable', async () => {
    const signedOut = await getGitLabCommitPipelines(CONTEXT, PROJECT, [SHA_A], {
      runApi: async () => {
        throw glabError('HTTP 401 Unauthorized. Run glab auth login')
      }
    })
    const forbidden = await getGitLabCommitPipelines(CONTEXT, PROJECT, [SHA_A], {
      runApi: async () => {
        throw glabError('HTTP 403 insufficient_scope')
      }
    })

    expect(signedOut).toEqual({ available: false, reason: 'not-authenticated' })
    expect(forbidden).toEqual({ available: false, reason: 'forbidden' })
  })

  it('rethrows transient failures so the last good icons stay', async () => {
    await expect(
      getGitLabCommitPipelines(CONTEXT, PROJECT, [SHA_A], {
        runApi: async () => {
          throw glabError('HTTP 502 Bad Gateway')
        }
      })
    ).rejects.toThrow()
  })

  it('shares one in-flight list per project', async () => {
    let resolve: (value: string) => void = () => {}
    const runApi = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done
        })
    )

    const first = getGitLabCommitPipelines(CONTEXT, PROJECT, [SHA_A], { runApi })
    const second = getGitLabCommitPipelines(CONTEXT, PROJECT, [SHA_B], { runApi })
    resolve('[]')
    await Promise.all([first, second])

    expect(runApi).toHaveBeenCalledTimes(1)
  })
})
