// @vitest-environment happy-dom
//
// Pins the shared poll: one interval per site however many cards watch it, no overlapping
// requests, a focus refresh, no ticks while unfocused or hidden, and transitions that hold until
// the stack confirms them.

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { LocalWpStackDetection } from '../../../../shared/site-stack-types'
import {
  readSiteStackStatus,
  refreshSiteStackStatus,
  resetSiteStackStatusForTests,
  setSiteStackTransition,
  SITE_STACK_POLL_INTERVAL_MS,
  useSiteStackStatus
} from './use-site-stack-status'

function detection(overrides: Partial<LocalWpStackDetection> = {}): LocalWpStackDetection {
  return {
    supported: true,
    reason: '',
    stack: 'ddev',
    appRunning: true,
    registered: true,
    siteId: 'alchemy',
    domain: 'alchemy.ddev.site:8843',
    socketPath: '',
    socketReady: true,
    phpVersion: '8.3',
    ...overrides
  }
}

let detect: Mock
let visibility: DocumentVisibilityState = 'visible'

async function watch(siteId: string): Promise<() => void> {
  const root = createRoot(document.createElement('div'))
  function Probe(): null {
    useSiteStackStatus(siteId)
    return null
  }
  await act(async () => {
    root.render(createElement(Probe))
  })
  return () => act(() => root.unmount())
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  detect = vi.fn().mockResolvedValue({ ok: true, value: detection() })
  Reflect.set(globalThis.window, 'api', {
    siteStacks: { detect },
    sites: { onChanged: () => () => {} }
  })
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
})

afterEach(() => {
  resetSiteStackStatusForTests()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('shared site stack poll', () => {
  it('serves two watchers from one poll and stops when both leave', async () => {
    const first = await watch('site-1')
    const second = await watch('site-1')
    expect(detect).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(SITE_STACK_POLL_INTERVAL_MS)
    expect(detect).toHaveBeenCalledTimes(2)
    first()
    second()
    await vi.advanceTimersByTimeAsync(SITE_STACK_POLL_INTERVAL_MS * 3)
    expect(detect).toHaveBeenCalledTimes(2)
  })

  it('never overlaps requests and runs one queued refresh after', async () => {
    let release: (value: unknown) => void = () => {}
    detect.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    const pending = refreshSiteStackStatus('site-2')
    void refreshSiteStackStatus('site-2')
    void refreshSiteStackStatus('site-2')
    expect(detect).toHaveBeenCalledTimes(1)
    release({ ok: true, value: detection() })
    await pending
    await vi.runOnlyPendingTimersAsync()
    expect(detect).toHaveBeenCalledTimes(2)
  })

  it('refreshes on focus and skips ticks while unfocused or hidden', async () => {
    const stop = await watch('site-3')
    expect(detect).toHaveBeenCalledTimes(1)
    vi.mocked(document.hasFocus).mockReturnValue(false)
    await vi.advanceTimersByTimeAsync(SITE_STACK_POLL_INTERVAL_MS)
    expect(detect).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('focus'))
    await vi.runOnlyPendingTimersAsync()
    expect(detect).toHaveBeenCalledTimes(2)
    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    vi.mocked(document.hasFocus).mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(SITE_STACK_POLL_INTERVAL_MS * 2)
    expect(detect).toHaveBeenCalledTimes(2)
    stop()
  })

  it('holds a starting transition until the stack reports it running', async () => {
    detect.mockResolvedValueOnce({ ok: true, value: detection({ socketReady: false }) })
    setSiteStackTransition('site-4', 'starting')
    await refreshSiteStackStatus('site-4')
    expect(readSiteStackStatus('site-4').transition).toBe('starting')
    await refreshSiteStackStatus('site-4')
    expect(readSiteStackStatus('site-4')).toMatchObject({
      transition: null,
      detection: { socketReady: true }
    })
  })
})
