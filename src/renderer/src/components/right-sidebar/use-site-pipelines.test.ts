// @vitest-environment happy-dom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSitePipelines } from './use-site-pipelines'

const POLL_MS = 60_000

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

function stubApi(pipelines: ReturnType<typeof vi.fn>): void {
  ;(window as unknown as { api: unknown }).api = { sites: { pipelines } }
}

describe('useSitePipelines', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  afterEach(() => {
    // Why: an un-unmounted hook keeps its interval AND reads window.api at call time, so a later
    // test's fake-timer advance makes the previous test's poller call the current test's mock.
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reads once immediately so the panel is not blank for a minute', async () => {
    const pipelines = vi.fn(async () => ({
      ok: true,
      value: { available: false, reason: 'not-bitbucket' }
    }))
    stubApi(pipelines)

    renderHook(() => useSitePipelines('site-1'))

    await waitFor(() => expect(pipelines).toHaveBeenCalledTimes(1))
    expect(pipelines).toHaveBeenCalledWith('site-1')
  })

  it('polls a minute apart, not at the run-history cadence', async () => {
    // Why this is pinned: the sibling run poll ticks every 2.5s against a local store. The same
    // cadence here would burn the Bitbucket hourly API budget within minutes.
    vi.useFakeTimers()
    const pipelines = vi.fn(async () => ({
      ok: true,
      value: { available: false, reason: 'not-bitbucket' }
    }))
    stubApi(pipelines)

    renderHook(() => useSitePipelines('site-1'))
    expect(pipelines).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2_500)
    expect(pipelines).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(pipelines).toHaveBeenCalledTimes(2)
  })

  it('stops polling while the window is hidden and reads again on reveal', async () => {
    vi.useFakeTimers()
    const pipelines = vi.fn(async () => ({
      ok: true,
      value: { available: false, reason: 'not-bitbucket' }
    }))
    stubApi(pipelines)

    renderHook(() => useSitePipelines('site-1'))
    expect(pipelines).toHaveBeenCalledTimes(1)

    setVisibility('hidden')
    expect(document.visibilityState).toBe('hidden')
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(pipelines).toHaveBeenCalledTimes(1)

    // Revealing reads straight away: a build that finished while away should not wait a minute.
    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(pipelines).toHaveBeenCalledTimes(2)
  })

  it('keeps the last good value when a poll fails', async () => {
    // Why: a flaky network should not blank a status the user is already reading.
    const good = { available: true, value: { status: 'success', headSha: 'abc', builds: [] } }
    const pipelines = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: good })
      .mockResolvedValue({ ok: false, error: 'network down' })
    stubApi(pipelines)

    const { result } = renderHook(() => useSitePipelines('site-1'))
    await waitFor(() => expect(result.current).toEqual(good))

    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(result.current).toEqual(good)
  })

  it('clears the previous site status when the panel switches sites', async () => {
    // Why: showing site A's green tick over site B's header would be a lie during the fetch gap.
    const slow = { available: true, value: { status: 'success', headSha: 'abc', builds: [] } }
    const pipelines = vi.fn(async () => ({ ok: true, value: slow }))
    stubApi(pipelines)

    const { result, rerender } = renderHook(({ id }) => useSitePipelines(id), {
      initialProps: { id: 'site-1' }
    })
    await waitFor(() => expect(result.current).toEqual(slow))

    rerender({ id: 'site-2' })
    expect(result.current).toBeNull()
  })
})
