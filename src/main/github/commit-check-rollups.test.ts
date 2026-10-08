import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetGitHubCommitChecksInFlight,
  buildCommitRollupQuery,
  getGitHubCommitChecks,
  mapCheckRollupState
} from './commit-check-rollups'

const REPO = { owner: 'efront', repo: 'site', host: 'github.com' }
const CONTEXT = { repoPath: '/repo' }
const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

function deps(runGraphql: (args: string[]) => Promise<string>) {
  return {
    runGraphql: vi.fn(runGraphql),
    resolveExecOptions: async () => ({}),
    isRateLimited: () => false
  }
}

function ghError(stderr: string): Error {
  return Object.assign(new Error('gh failed'), { stderr })
}

describe('mapCheckRollupState', () => {
  it('collapses the rollup states onto the shared vocabulary', () => {
    expect(mapCheckRollupState('SUCCESS')).toBe('success')
    expect(mapCheckRollupState('FAILURE')).toBe('failure')
    expect(mapCheckRollupState('ERROR')).toBe('failure')
    expect(mapCheckRollupState('PENDING')).toBe('running')
    expect(mapCheckRollupState('EXPECTED')).toBe('pending')
    expect(mapCheckRollupState(null)).toBeNull()
  })
})

describe('buildCommitRollupQuery', () => {
  it('aliases one object lookup per commit so the whole list is one request', () => {
    const query = buildCommitRollupQuery([SHA_A, SHA_B])

    expect(query).toContain(`c0: object(oid: "${SHA_A}")`)
    expect(query).toContain(`c1: object(oid: "${SHA_B}")`)
    expect(query).toContain('statusCheckRollup { state }')
  })
})

describe('getGitHubCommitChecks', () => {
  beforeEach(() => {
    _resetGitHubCommitChecksInFlight()
  })

  it('maps aliased results back to their commits and skips commits without checks', async () => {
    const d = deps(async () =>
      JSON.stringify({
        data: {
          repository: {
            c0: { committedDate: '2026-10-09T00:00:00Z', statusCheckRollup: { state: 'FAILURE' } },
            c1: { committedDate: '2026-10-09T00:00:00Z', statusCheckRollup: null }
          }
        }
      })
    )

    const result = await getGitHubCommitChecks(CONTEXT, REPO, [SHA_A, SHA_B], d)

    expect(d.runGraphql).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      available: true,
      runsBySha: {
        [SHA_A]: {
          status: 'failure',
          runNumber: null,
          durationSeconds: null,
          currentStep: null,
          startedAt: Date.parse('2026-10-09T00:00:00Z'),
          url: `https://github.com/efront/site/commit/${SHA_A}/checks`
        }
      }
    })
  })

  it('treats a signed-out gh as unavailable rather than an error', async () => {
    const result = await getGitHubCommitChecks(
      CONTEXT,
      REPO,
      [SHA_A],
      deps(async () => {
        throw ghError('To get started with GitHub CLI, please run:  gh auth login')
      })
    )

    expect(result).toEqual({ available: false, reason: 'not-authenticated' })
  })

  it('treats no access as unavailable', async () => {
    const result = await getGitHubCommitChecks(
      CONTEXT,
      REPO,
      [SHA_A],
      deps(async () => {
        throw ghError('HTTP 403: Resource not accessible by integration')
      })
    )

    expect(result).toEqual({ available: false, reason: 'forbidden' })
  })

  it('rethrows rate limits and network failures so the last good icons stay', async () => {
    await expect(
      getGitHubCommitChecks(
        CONTEXT,
        REPO,
        [SHA_A],
        deps(async () => {
          throw ghError('HTTP 403: API rate limit exceeded')
        })
      )
    ).rejects.toThrow()
  })

  it('spends nothing when the shared GraphQL budget is nearly gone', async () => {
    const d = { ...deps(async () => '{}'), isRateLimited: () => true }

    await expect(getGitHubCommitChecks(CONTEXT, REPO, [SHA_A], d)).rejects.toThrow('rate limit')
    expect(d.runGraphql).not.toHaveBeenCalled()
  })

  it('shares one in-flight request for the same repo and commits', async () => {
    let resolve: (value: string) => void = () => {}
    const d = deps(
      () =>
        new Promise<string>((done) => {
          resolve = done
        })
    )

    const first = getGitHubCommitChecks(CONTEXT, REPO, [SHA_A], d)
    const second = getGitHubCommitChecks(CONTEXT, REPO, [SHA_A], d)
    await vi.waitFor(() => expect(d.runGraphql).toHaveBeenCalledTimes(1))
    resolve('{"data":{"repository":{}}}')
    await Promise.all([first, second])

    expect(d.runGraphql).toHaveBeenCalledTimes(1)
  })
})
