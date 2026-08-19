// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatThreadContentSearch } from './use-chat-thread-content-search'

const searchThreadContent = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  searchThreadContent.mockReset()
  ;(window as unknown as { api: unknown }).api = { chatMode: { searchThreadContent } }
})

afterEach(() => {
  vi.useRealTimers()
})

function match(threadId: string, snippet: string) {
  return { threadId, source: 'user' as const, snippet }
}

describe('useChatThreadContentSearch', () => {
  it('does not search a query below the minimum length', async () => {
    renderHook(() => useChatThreadContentSearch('a'))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(searchThreadContent).not.toHaveBeenCalled()
  })

  it('debounces so typing a word is a single search', async () => {
    const { rerender } = renderHook(({ q }) => useChatThreadContentSearch(q), {
      initialProps: { q: 'st' }
    })
    searchThreadContent.mockResolvedValue({ matches: [], truncated: false })
    rerender({ q: 'sta' })
    rerender({ q: 'stag' })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(searchThreadContent).toHaveBeenCalledTimes(1)
    expect(searchThreadContent).toHaveBeenCalledWith({ query: 'stag' })
  })

  it('exposes matches keyed by thread', async () => {
    searchThreadContent.mockResolvedValue({
      matches: [match('t1', 'deploy staging')],
      truncated: false
    })
    const { result } = renderHook(() => useChatThreadContentSearch('staging'))
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(result.current.get('t1')?.snippet).toBe('deploy staging')
  })

  it('keeps the newest results when an older search resolves last', async () => {
    // Without the cancelled guard the slow first search would land second and
    // overwrite the excerpts for the query actually in the box.
    let resolveFirst: (value: unknown) => void = () => {}
    searchThreadContent
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        })
      )
      .mockResolvedValueOnce({ matches: [match('new', 'newest')], truncated: false })

    const { result, rerender } = renderHook(({ q }) => useChatThreadContentSearch(q), {
      initialProps: { q: 'sta' }
    })
    await act(() => vi.advanceTimersByTimeAsync(1_000))

    rerender({ q: 'stag' })
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(result.current.get('new')?.snippet).toBe('newest')

    resolveFirst({ matches: [match('old', 'stale')], truncated: false })
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(result.current.has('old')).toBe(false)
    expect(result.current.get('new')?.snippet).toBe('newest')
  })

  it('falls back to no content matches when the search fails', async () => {
    searchThreadContent.mockRejectedValue(new Error('nope'))
    const { result } = renderHook(() => useChatThreadContentSearch('staging'))
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(result.current.size).toBe(0)
  })
})
