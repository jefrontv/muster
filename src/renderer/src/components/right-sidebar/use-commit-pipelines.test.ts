// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitHistoryResult } from '../../../../shared/git-history'
import {
  COMMIT_PIPELINES_MAX_SHAS,
  type CommitPipelinesResult
} from '../../../../shared/commit-pipelines'
import { useCommitPipelines, type UseCommitPipelinesInput } from './use-commit-pipelines'
import {
  COMMIT_PIPELINES_AFTER_PUSH_DELAY_MS,
  COMMIT_PIPELINES_POLL_MS
} from './commit-pipelines-polling'

vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => null }))

const SHA = 'a'.repeat(40)

function history(ids: string[] = [SHA]): GitHistoryResult {
  return {
    items: ids.map((id) => ({ id, parentIds: [], subject: 's', message: 's' }))
  } as unknown as GitHistoryResult
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

function stubApi(results: CommitPipelinesResult[]): ReturnType<typeof vi.fn> {
  let index = 0
  const commitPipelines = vi.fn(async () => results[Math.min(index++, results.length - 1)])
  ;(window as unknown as { api: unknown }).api = { git: { commitPipelines } }
  return commitPipelines
}

function running(): CommitPipelinesResult {
  return {
    available: true,
    runsBySha: {
      [SHA]: {
        status: 'running',
        runNumber: 1,
        durationSeconds: null,
        currentStep: null,
        startedAt: Date.now(),
        url: null
      }
    }
  }
}

function passed(): CommitPipelinesResult {
  return {
    available: true,
    runsBySha: {
      [SHA]: {
        status: 'success',
        runNumber: 1,
        durationSeconds: 10,
        currentStep: null,
        startedAt: Date.now(),
        url: null
      }
    }
  }
}

function baseInput(overrides: Partial<UseCommitPipelinesInput> = {}): UseCommitPipelinesInput {
  return {
    worktreeId: 'wt-1',
    worktreePath: '/repo',
    settings: { activeRuntimeEnvironmentId: null },
    enabled: true,
    history: history(),
    pushState: { hasUpstream: true, upstreamName: 'origin/main', ahead: 0 },
    ...overrides
  }
}

describe('useCommitPipelines', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('reads once on history load and does not poll when nothing is in flight', async () => {
    const commitPipelines = stubApi([passed()])

    const { result } = renderHook(() => useCommitPipelines(baseInput()))
    await act(async () => {})

    expect(commitPipelines).toHaveBeenCalledWith({
      worktreePath: '/repo',
      connectionId: undefined,
      shas: [SHA]
    })
    expect(result.current?.[SHA]?.status).toBe('success')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMIT_PIPELINES_POLL_MS * 3)
    })
    expect(commitPipelines).toHaveBeenCalledTimes(1)
  })

  it('looks up newly loaded rows but only the newest capped set', async () => {
    const commitPipelines = stubApi([passed()])
    const ids = Array.from({ length: 150 }, (_, index) => index.toString(16).padStart(40, '0'))

    const { rerender } = renderHook((input: UseCommitPipelinesInput) => useCommitPipelines(input), {
      initialProps: baseInput({ history: history(ids.slice(0, 50)) })
    })
    await act(async () => {})
    rerender(baseInput({ history: history(ids) }))
    await act(async () => {})

    expect(commitPipelines).toHaveBeenCalledTimes(2)
    expect(commitPipelines).toHaveBeenLastCalledWith({
      worktreePath: '/repo',
      connectionId: undefined,
      shas: ids.slice(0, COMMIT_PIPELINES_MAX_SHAS)
    })
  })

  it('polls a minute apart while a run is in flight and stops once it finishes', async () => {
    const commitPipelines = stubApi([running(), passed()])

    renderHook(() => useCommitPipelines(baseInput()))
    await act(async () => {})
    expect(commitPipelines).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMIT_PIPELINES_POLL_MS)
    })
    expect(commitPipelines).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMIT_PIPELINES_POLL_MS * 3)
    })
    expect(commitPipelines).toHaveBeenCalledTimes(2)
  })

  it('stops polling while the window is hidden and reads again on reveal', async () => {
    const commitPipelines = stubApi([running()])

    renderHook(() => useCommitPipelines(baseInput()))
    await act(async () => {})

    act(() => setVisibility('hidden'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMIT_PIPELINES_POLL_MS * 3)
    })
    expect(commitPipelines).toHaveBeenCalledTimes(1)

    await act(async () => setVisibility('visible'))
    expect(commitPipelines).toHaveBeenCalledTimes(2)
  })

  it('hides the column when the forge answers unavailable', async () => {
    stubApi([{ available: false, reason: 'forbidden' }])

    const { result } = renderHook(() => useCommitPipelines(baseInput()))
    await act(async () => {})

    expect(result.current).toBeNull()
  })

  it('keeps the last good icons when a refresh fails', async () => {
    const commitPipelines = stubApi([running()])

    const { result } = renderHook(() => useCommitPipelines(baseInput()))
    await act(async () => {})
    commitPipelines.mockRejectedValueOnce(new Error('offline'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMIT_PIPELINES_POLL_MS)
    })
    expect(commitPipelines).toHaveBeenCalledTimes(2)
    expect(result.current?.[SHA]?.status).toBe('running')
  })

  it('does nothing for a remote runtime, a disabled panel or an empty history', async () => {
    const commitPipelines = stubApi([passed()])

    renderHook(() =>
      useCommitPipelines(baseInput({ settings: { activeRuntimeEnvironmentId: 'env-1' } }))
    )
    renderHook(() => useCommitPipelines(baseInput({ enabled: false })))
    renderHook(() => useCommitPipelines(baseInput({ history: history([]) })))
    await act(async () => {})

    expect(commitPipelines).not.toHaveBeenCalled()
  })

  it('reads again shortly after a push even though the commits did not change', async () => {
    const commitPipelines = stubApi([passed()])
    const { rerender } = renderHook((input: UseCommitPipelinesInput) => useCommitPipelines(input), {
      initialProps: baseInput({
        pushState: { hasUpstream: true, upstreamName: 'origin/main', ahead: 1 }
      })
    })
    await act(async () => {})
    expect(commitPipelines).toHaveBeenCalledTimes(1)

    rerender(baseInput())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMIT_PIPELINES_AFTER_PUSH_DELAY_MS)
    })
    expect(commitPipelines).toHaveBeenCalledTimes(2)
  })
})
