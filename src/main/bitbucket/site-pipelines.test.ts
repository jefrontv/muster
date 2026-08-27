import { describe, expect, it, vi } from 'vitest'
import { deriveStepProgress, getSitePipelines, mapPipelineStatus } from './site-pipelines'

describe('deriveStepProgress', () => {
  it('names the first unfinished step and counts the finished ones', () => {
    const steps = [
      { name: 'Build', state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } } },
      { name: 'Test', state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } } },
      { name: 'Deploy', state: { name: 'IN_PROGRESS' } },
      { name: 'Notify', state: { name: 'PENDING' } }
    ]

    expect(deriveStepProgress(steps)).toEqual({
      currentStep: 'Deploy',
      completedSteps: 2,
      totalSteps: 4
    })
  })

  it('does not report a current step once everything has finished', () => {
    const steps = [{ name: 'Build', state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } } }]

    expect(deriveStepProgress(steps)).toEqual({
      currentStep: null,
      completedSteps: 1,
      totalSteps: 1
    })
  })

  it('handles an empty step list without inventing progress', () => {
    expect(deriveStepProgress([])).toEqual({
      currentStep: null,
      completedSteps: 0,
      totalSteps: 0
    })
  })
})

const REPO = { workspace: 'efront_au', repoSlug: '107-darling' }

function deps(overrides: Parameters<typeof getSitePipelines>[1] = {}) {
  return {
    resolveRepoRef: async () => REPO,
    hasAuth: () => true,
    fetchPipelines: async () => [],
    fetchSteps: async () => [],
    ...overrides
  }
}

describe('mapPipelineStatus', () => {
  it('separates "finished" from "passed", which Bitbucket reports independently', () => {
    // A COMPLETED pipeline is not a passing one — the result decides.
    expect(
      mapPipelineStatus({ state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } } })
    ).toBe('success')
    expect(mapPipelineStatus({ state: { name: 'COMPLETED', result: { name: 'FAILED' } } })).toBe(
      'failure'
    )
    expect(mapPipelineStatus({ state: { name: 'COMPLETED', result: { name: 'ERROR' } } })).toBe(
      'failure'
    )
    expect(mapPipelineStatus({ state: { name: 'COMPLETED', result: { name: 'STOPPED' } } })).toBe(
      'stopped'
    )
  })

  it('maps in-flight and halted states', () => {
    expect(mapPipelineStatus({ state: { name: 'IN_PROGRESS' } })).toBe('running')
    expect(mapPipelineStatus({ state: { name: 'PENDING' } })).toBe('pending')
    expect(mapPipelineStatus({ state: { name: 'PAUSED' } })).toBe('paused')
    expect(mapPipelineStatus({ state: { name: 'HALTED' } })).toBe('paused')
  })

  it('does not guess at states it has never seen', () => {
    expect(mapPipelineStatus({ state: { name: 'SOMETHING_NEW' } })).toBe('unknown')
    expect(mapPipelineStatus({ state: { name: 'COMPLETED', result: { name: 'WAT' } } })).toBe(
      'unknown'
    )
    expect(mapPipelineStatus({})).toBe('unknown')
  })
})

describe('getSitePipelines', () => {
  it('resolves the current step for a running run, and only for the newest one', async () => {
    const fetchSteps = vi.fn(async () => [
      { name: 'Build', state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } } },
      { name: 'Deploy', state: { name: 'IN_PROGRESS' } }
    ])
    const result = await getSitePipelines(
      '/repo',
      deps({
        fetchPipelines: async () => [
          { build_number: 90, uuid: '{abc}', state: { name: 'IN_PROGRESS' } },
          { build_number: 89, uuid: '{def}', state: { name: 'IN_PROGRESS' } }
        ],
        fetchSteps
      })
    )

    expect(fetchSteps).toHaveBeenCalledTimes(1)
    expect(fetchSteps).toHaveBeenCalledWith(REPO, '{abc}')
    expect(result).toMatchObject({
      runs: [
        { buildNumber: 90, currentStep: 'Deploy', completedSteps: 1, totalSteps: 2 },
        { buildNumber: 89, currentStep: null, completedSteps: null, totalSteps: null }
      ]
    })
  })

  it('finds the running step even when newer runs already finished above it', async () => {
    // Seen live on adamson-eoi: #121 sat IN_PROGRESS while #122 and #123 completed, so the
    // in-flight run was third in the list, not first.
    const fetchSteps = vi.fn(async () => [
      { name: 'Build', state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } } },
      { name: 'Deploy', state: { name: 'IN_PROGRESS' } }
    ])
    const result = await getSitePipelines(
      '/repo',
      deps({
        fetchPipelines: async () => [
          {
            build_number: 123,
            uuid: '{c}',
            state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } }
          },
          {
            build_number: 122,
            uuid: '{b}',
            state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } }
          },
          { build_number: 121, uuid: '{a}', state: { name: 'IN_PROGRESS' } }
        ],
        fetchSteps
      })
    )

    expect(fetchSteps).toHaveBeenCalledWith(REPO, '{a}')
    expect(result).toMatchObject({
      runs: [
        { buildNumber: 123, currentStep: null },
        { buildNumber: 122, currentStep: null },
        { buildNumber: 121, currentStep: 'Deploy', completedSteps: 1, totalSteps: 2 }
      ]
    })
  })

  it('does not spend a steps call on a finished pipeline', async () => {
    // Why: steps cost a second request per poll, and nobody asks which step a two-day-old run
    // is on.
    const fetchSteps = vi.fn(async () => [])
    await getSitePipelines(
      '/repo',
      deps({
        fetchPipelines: async () => [
          {
            build_number: 88,
            uuid: '{ghi}',
            state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } }
          }
        ],
        fetchSteps
      })
    )

    expect(fetchSteps).not.toHaveBeenCalled()
  })

  it('still shows the run when the steps call fails', async () => {
    // Why: losing the whole row because a follow-up request failed would be a worse outcome than
    // simply not naming the step.
    const result = await getSitePipelines(
      '/repo',
      deps({
        fetchPipelines: async () => [
          { build_number: 91, uuid: '{jkl}', state: { name: 'IN_PROGRESS' } }
        ],
        fetchSteps: async () => {
          throw new Error('Bitbucket request failed: HTTP 500')
        }
      })
    )

    expect(result).toMatchObject({
      runs: [{ buildNumber: 91, status: 'running', currentStep: null }]
    })
  })

  it('returns recent runs with a link to the page a person can open', async () => {
    const result = await getSitePipelines(
      '/repo',
      deps({
        fetchPipelines: async () => [
          {
            build_number: 30,
            state: { name: 'COMPLETED', result: { name: 'SUCCESSFUL' } },
            target: { ref_name: 'master', commit: { hash: 'abc123' } },
            trigger: { name: 'PUSH' },
            created_on: '2020-12-15T05:57:59.536868Z',
            duration_in_seconds: 64
          }
        ]
      })
    )

    expect(result).toMatchObject({
      available: true,
      workspace: 'efront_au',
      runs: [
        {
          buildNumber: 30,
          status: 'success',
          refName: 'master',
          commitSha: 'abc123',
          trigger: 'PUSH',
          durationSeconds: 64,
          // The API's own `links.self` points at JSON keyed by repo UUID; this is the human page.
          url: 'https://bitbucket.org/efront_au/107-darling/pipelines/results/30'
        }
      ]
    })
    expect((result as { runs: { createdOn: number }[] }).runs[0].createdOn).toBe(
      Date.parse('2020-12-15T05:57:59.536868Z')
    )
  })

  it('drops a row with no build number rather than rendering a nameless run', async () => {
    const result = await getSitePipelines(
      '/repo',
      deps({
        fetchPipelines: async () => [{ state: { name: 'IN_PROGRESS' } }, { build_number: 2 }]
      })
    )

    expect(result).toMatchObject({ available: true, runs: [{ buildNumber: 2 }] })
  })

  it('skips a non-Bitbucket remote without checking auth or calling the API', async () => {
    // Why: a GitHub site is not an error, and probing it would spend work per site.
    const hasAuth = vi.fn(() => true)
    const fetchPipelines = vi.fn(async () => [])

    const result = await getSitePipelines(
      '/repo',
      deps({ resolveRepoRef: async () => null, hasAuth, fetchPipelines })
    )

    expect(result).toEqual({ available: false, reason: 'not-bitbucket' })
    expect(hasAuth).not.toHaveBeenCalled()
    expect(fetchPipelines).not.toHaveBeenCalled()
  })

  it('reports not-authenticated only after confirming the remote is Bitbucket', async () => {
    // Why the order matters: someone with no Bitbucket sites should never be told to sign in.
    const fetchPipelines = vi.fn(async () => [])

    const result = await getSitePipelines('/repo', deps({ hasAuth: () => false, fetchPipelines }))

    expect(result).toEqual({ available: false, reason: 'not-authenticated' })
    expect(fetchPipelines).not.toHaveBeenCalled()
  })

  it('degrades to a reason when the OAuth consumer lacks the pipeline scope', async () => {
    // A self-built Muster can point at a consumer without it; 403 forever must not surface as an
    // error the user cannot act on.
    const result = await getSitePipelines(
      '/repo',
      deps({
        fetchPipelines: async () => {
          throw new Error('Bitbucket request failed: HTTP 403')
        }
      })
    )

    expect(result).toEqual({ available: false, reason: 'forbidden' })
  })

  it('degrades to a reason when the repo is gone, not just when the scope is missing', async () => {
    // Seen live: sites whose Bitbucket repo was renamed keep the old remote URL, so every poll
    // 404s. That is permanent and quiet, not an outage.
    const result = await getSitePipelines(
      '/repo',
      deps({
        fetchPipelines: async () => {
          throw new Error('Bitbucket request failed: HTTP 404')
        }
      })
    )

    expect(result).toEqual({ available: false, reason: 'not-found' })
  })

  it('still throws on failures that are not a missing scope', async () => {
    // A 500 is transient; swallowing it as "no pipelines" would hide a real outage.
    await expect(
      getSitePipelines(
        '/repo',
        deps({
          fetchPipelines: async () => {
            throw new Error('Bitbucket request failed: HTTP 500')
          }
        })
      )
    ).rejects.toThrow('HTTP 500')
  })
})
