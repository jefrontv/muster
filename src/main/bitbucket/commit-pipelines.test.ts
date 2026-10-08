import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COMMIT_PIPELINES_PAGE_SIZE,
  _resetBitbucketCommitPipelinesInFlight,
  getBitbucketCommitPipelines,
  matchPipelineRunsToCommits
} from './commit-pipelines'
import type { SitePipelineRun } from '../../shared/site-types'

const REPO = { workspace: 'efront_au', repoSlug: '107-darling' }
const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)
const SHA_C = 'c'.repeat(40)

function run(overrides: Partial<SitePipelineRun>): SitePipelineRun {
  return {
    buildNumber: 1,
    status: 'success',
    refName: 'main',
    commitSha: SHA_A,
    trigger: 'PUSH',
    createdOn: 1_000,
    durationSeconds: 192,
    currentStep: null,
    completedSteps: null,
    totalSteps: null,
    url: 'https://bitbucket.org/efront_au/107-darling/pipelines/results/1',
    ...overrides
  }
}

describe('matchPipelineRunsToCommits', () => {
  it('keeps the newest run per commit, relying on the API order', () => {
    const runs = [
      run({ buildNumber: 9, status: 'failure', commitSha: SHA_A }),
      run({ buildNumber: 8, status: 'success', commitSha: SHA_A })
    ]

    expect(matchPipelineRunsToCommits(runs, [SHA_A])[SHA_A]).toMatchObject({
      runNumber: 9,
      status: 'failure',
      durationSeconds: 192,
      startedAt: 1_000
    })
  })

  it('matches by full hash regardless of case and ignores commits nobody asked about', () => {
    const runs = [
      run({ buildNumber: 3, commitSha: SHA_B.toUpperCase() }),
      run({ buildNumber: 2, commitSha: SHA_C })
    ]

    const matched = matchPipelineRunsToCommits(runs, [SHA_B])
    expect(Object.keys(matched)).toEqual([SHA_B])
    expect(matched[SHA_B]?.runNumber).toBe(3)
  })

  it('leaves commits without a run out of the map so their cell stays empty', () => {
    expect(matchPipelineRunsToCommits([run({ commitSha: null })], [SHA_A])).toEqual({})
  })

  it('skips a run whose state cannot be named and falls back to an older one', () => {
    const runs = [
      run({ buildNumber: 5, status: 'unknown' }),
      run({ buildNumber: 4, status: 'success' })
    ]

    expect(matchPipelineRunsToCommits(runs, [SHA_A])[SHA_A]?.runNumber).toBe(4)
  })

  it('carries paused and stopped through so they draw as idle, not in flight', () => {
    expect(matchPipelineRunsToCommits([run({ status: 'paused' })], [SHA_A])[SHA_A]?.status).toBe(
      'paused'
    )
    expect(matchPipelineRunsToCommits([run({ status: 'stopped' })], [SHA_A])[SHA_A]?.status).toBe(
      'stopped'
    )
  })
})

describe('getBitbucketCommitPipelines', () => {
  beforeEach(() => {
    _resetBitbucketCommitPipelinesInFlight()
  })

  it('asks for a page wide enough for the Commits panel, not the Sites panel three', async () => {
    const fetchPipelines = vi.fn(async () => [])

    await getBitbucketCommitPipelines(REPO, [SHA_A], {
      hasAuth: () => true,
      fetchPipelines
    })

    expect(fetchPipelines).toHaveBeenCalledWith(REPO, COMMIT_PIPELINES_PAGE_SIZE)
  })

  it('matches raw API runs to commits and names the running step', async () => {
    const result = await getBitbucketCommitPipelines(REPO, [SHA_A, SHA_B], {
      hasAuth: () => true,
      fetchPipelines: async () => [
        {
          uuid: '{run-2}',
          build_number: 412,
          state: { name: 'IN_PROGRESS' },
          target: { commit: { hash: SHA_B } }
        },
        {
          build_number: 411,
          state: { name: 'COMPLETED', result: { name: 'FAILED' } },
          target: { commit: { hash: SHA_A } },
          duration_in_seconds: 192
        }
      ],
      fetchSteps: async () => [
        { name: 'Build', state: { name: 'COMPLETED' } },
        { name: 'Deploy', state: { name: 'IN_PROGRESS' } }
      ]
    })

    expect(result).toEqual({
      available: true,
      runsBySha: {
        [SHA_B]: expect.objectContaining({
          runNumber: 412,
          status: 'running',
          currentStep: 'Deploy'
        }),
        [SHA_A]: expect.objectContaining({
          runNumber: 411,
          status: 'failure',
          url: 'https://bitbucket.org/efront_au/107-darling/pipelines/results/411'
        })
      }
    })
  })

  it('answers not-authenticated without spending a call', async () => {
    const fetchPipelines = vi.fn(async () => [])

    const result = await getBitbucketCommitPipelines(REPO, [SHA_A], {
      hasAuth: () => false,
      fetchPipelines
    })

    expect(result).toEqual({ available: false, reason: 'not-authenticated' })
    expect(fetchPipelines).not.toHaveBeenCalled()
  })

  it('reports a missing pipeline scope as unavailable instead of throwing', async () => {
    const result = await getBitbucketCommitPipelines(REPO, [SHA_A], {
      hasAuth: () => true,
      fetchPipelines: async () => {
        throw new Error('Bitbucket request failed: HTTP 403')
      }
    })

    expect(result).toEqual({ available: false, reason: 'forbidden' })
  })

  it('rethrows transient failures so the renderer keeps the last good icons', async () => {
    await expect(
      getBitbucketCommitPipelines(REPO, [SHA_A], {
        hasAuth: () => true,
        fetchPipelines: async () => {
          throw new Error('Bitbucket request failed: HTTP 502')
        }
      })
    ).rejects.toThrow('HTTP 502')
  })

  it('shares one in-flight request per repo across concurrent callers', async () => {
    let release: (value: never[]) => void = () => {}
    const fetchPipelines = vi.fn(
      () =>
        new Promise<never[]>((resolve) => {
          release = resolve
        })
    )
    const deps = { hasAuth: () => true, fetchPipelines }

    const first = getBitbucketCommitPipelines(REPO, [SHA_A], deps)
    const second = getBitbucketCommitPipelines(REPO, [SHA_B], deps)
    release([])
    await Promise.all([first, second])

    expect(fetchPipelines).toHaveBeenCalledTimes(1)

    await getBitbucketCommitPipelines(REPO, [SHA_A], {
      hasAuth: () => true,
      fetchPipelines: async () => []
    })
    expect(fetchPipelines).toHaveBeenCalledTimes(1)
  })
})
