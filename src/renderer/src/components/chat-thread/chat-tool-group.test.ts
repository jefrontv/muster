// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIVE_LABEL_MIN_MS, toolCategoryLabel, useHeldLiveLabel } from './chat-tool-group-label'
import { scrollFadesOf } from './chat-tool-group-scroll-fades'

describe('toolCategoryLabel', () => {
  it('uses DSH verbs, live and settled', () => {
    expect(toolCategoryLabel('search', false)).toBe('Searched files')
    expect(toolCategoryLabel('web', true)).toBe('Fetching pages')
    expect(toolCategoryLabel('other', false)).toBe('Used tools')
  })
})

describe('useHeldLiveLabel', () => {
  afterEach(() => vi.useRealTimers())

  it('holds a live title for at least 150ms before the next one replaces it', () => {
    vi.useFakeTimers()
    const hook = renderHook(({ label, live }) => useHeldLiveLabel(label, live), {
      initialProps: { label: 'Reading files', live: true }
    })
    hook.rerender({ label: 'Running commands', live: true })
    expect(hook.result.current).toBe('Reading files')
    act(() => {
      vi.advanceTimersByTime(LIVE_LABEL_MIN_MS)
    })
    expect(hook.result.current).toBe('Running commands')
  })

  it('shows the settled label at once', () => {
    const hook = renderHook(({ label, live }) => useHeldLiveLabel(label, live), {
      initialProps: { label: 'Reading files', live: true }
    })
    hook.rerender({ label: 'Read files', live: false })
    expect(hook.result.current).toBe('Read files')
  })
})

describe('scrollFadesOf', () => {
  it('fades only the edges that can still scroll', () => {
    expect(scrollFadesOf({ scrollTop: 0, scrollHeight: 100, clientHeight: 100 })).toEqual({
      top: false,
      bottom: false
    })
    expect(scrollFadesOf({ scrollTop: 0, scrollHeight: 300, clientHeight: 100 })).toEqual({
      top: false,
      bottom: true
    })
    expect(scrollFadesOf({ scrollTop: 100, scrollHeight: 300, clientHeight: 100 })).toEqual({
      top: true,
      bottom: true
    })
    expect(scrollFadesOf({ scrollTop: 200, scrollHeight: 300, clientHeight: 100 })).toEqual({
      top: true,
      bottom: false
    })
  })
})
