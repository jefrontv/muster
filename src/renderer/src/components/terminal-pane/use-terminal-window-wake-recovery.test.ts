// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'

const { recoverVisibleTerminalWindowWakeMock } = vi.hoisted(() => ({
  recoverVisibleTerminalWindowWakeMock: vi.fn()
}))

vi.mock('./terminal-visibility-resume', () => ({
  recoverVisibleTerminalWindowWake: recoverVisibleTerminalWindowWakeMock
}))

import {
  DISPLAY_SLEEP_LIKELY_HIDDEN_MS,
  useTerminalWindowWakeRecovery
} from './use-terminal-window-wake-recovery'
import {
  getTerminalFreezeBreadcrumbs,
  resetTerminalFreezeBreadcrumbsForTesting
} from './terminal-freeze-breadcrumbs'

describe('useTerminalWindowWakeRecovery', () => {
  const manager = {} as PaneManager
  let systemResumedCallback: (() => void) | null = null
  const unsubscribeSystemResumed = vi.fn()
  const onSystemResumed = vi.fn((callback: () => void) => {
    systemResumedCallback = callback
    return unsubscribeSystemResumed
  })

  beforeEach(() => {
    systemResumedCallback = null
    recoverVisibleTerminalWindowWakeMock.mockClear()
    unsubscribeSystemResumed.mockClear()
    onSystemResumed.mockClear()
    resetTerminalFreezeBreadcrumbsForTesting()
    // Why: without requestAnimationFrame the hook skips its settled-frame
    // follow-up, so every trigger maps to exactly one synchronous recovery.
    vi.stubGlobal('requestAnimationFrame', undefined)
    ;(window as unknown as { api: unknown }).api = { ui: { onSystemResumed } }
  })

  afterEach(() => {
    // Why: un-unmounted hooks keep their document listeners; a later test's dispatch would fan
    // out to every previous instance and inflate the recovery call counts.
    cleanup()
    vi.unstubAllGlobals()
    delete (window as unknown as { api?: unknown }).api
  })

  function renderWakeRecoveryHook(isVisible = true) {
    return renderHook(() =>
      useTerminalWindowWakeRecovery({
        isVisible,
        managerRef: { current: manager },
        isActiveRef: { current: true },
        isVisibleRef: { current: true }
      })
    )
  }

  it('clears the glyph atlas on system resume but not on plain window focus', () => {
    // Why: wiping the shared WebGL glyph atlas on a plain refocus provokes
    // xterm's page-merge race and paints garbled glyphs (#7604). Only a genuine
    // OS resume — which can leave a stale renderer surface — clears the atlas.
    renderWakeRecoveryHook()

    window.dispatchEvent(new Event('focus'))
    expect(recoverVisibleTerminalWindowWakeMock).toHaveBeenCalledTimes(1)
    expect(recoverVisibleTerminalWindowWakeMock).toHaveBeenNthCalledWith(1, {
      manager,
      isActive: true,
      clearGlyphAtlases: false
    })

    expect(systemResumedCallback).toBeTypeOf('function')
    systemResumedCallback?.()

    expect(recoverVisibleTerminalWindowWakeMock).toHaveBeenCalledTimes(2)
    expect(recoverVisibleTerminalWindowWakeMock).toHaveBeenNthCalledWith(2, {
      manager,
      isActive: true,
      clearGlyphAtlases: true
    })
  })

  function setVisibility(state: DocumentVisibilityState): void {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  it('keeps the warm atlas on a brief occlusion reveal', () => {
    // Why: occlusion-uncover fires visibilitychange on every Cmd+Tab back to a covered window;
    // wiping the atlas there re-rasterizes every glyph and the terminal visibly jitters.
    vi.useFakeTimers()
    try {
      renderWakeRecoveryHook()

      setVisibility('hidden')
      vi.advanceTimersByTime(5_000)
      setVisibility('visible')

      expect(recoverVisibleTerminalWindowWakeMock).toHaveBeenCalledTimes(1)
      expect(recoverVisibleTerminalWindowWakeMock).toHaveBeenCalledWith({
        manager,
        isActive: true,
        clearGlyphAtlases: false
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears the atlas when the window was hidden long enough for display sleep', () => {
    // Why: a screensaver/display-off wake fires neither focus nor the resume broadcast; the
    // long-hidden reveal is the only signal left, and a corrupted atlas must still heal there.
    vi.useFakeTimers()
    try {
      renderWakeRecoveryHook()

      setVisibility('hidden')
      vi.advanceTimersByTime(DISPLAY_SLEEP_LIKELY_HIDDEN_MS)
      setVisibility('visible')

      expect(recoverVisibleTerminalWindowWakeMock).toHaveBeenCalledTimes(1)
      expect(recoverVisibleTerminalWindowWakeMock).toHaveBeenCalledWith({
        manager,
        isActive: true,
        clearGlyphAtlases: true
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('treats a reveal with no recorded hide as brief', () => {
    // Why: a wedged occlusion tracker can report visible with no prior hidden; assuming display
    // sleep there would re-arm the mid-stream garble race on a warm atlas.
    renderWakeRecoveryHook()

    setVisibility('visible')

    expect(recoverVisibleTerminalWindowWakeMock).toHaveBeenCalledTimes(1)
    expect(recoverVisibleTerminalWindowWakeMock).toHaveBeenCalledWith({
      manager,
      isActive: true,
      clearGlyphAtlases: false
    })
  })

  it('records a wake-recovery breadcrumb with the trigger source and atlas decision', () => {
    // Why: a post-wake garble report attributes to the trigger that ran (or its
    // absence). Pin that focus records source=focus/atlas=false and system
    // resume records source=system-resumed/atlas=true.
    renderWakeRecoveryHook()

    window.dispatchEvent(new Event('focus'))
    systemResumedCallback?.()

    const wakeCrumbs = getTerminalFreezeBreadcrumbs().filter((crumb) =>
      crumb.kind.startsWith('wake-recovery:')
    )
    expect(wakeCrumbs.map((crumb) => [crumb.kind, crumb.detail])).toEqual([
      ['wake-recovery:focus', { clearGlyphAtlases: false }],
      ['wake-recovery:system-resumed', { clearGlyphAtlases: true }]
    ])
  })

  it('reasserts pane PTY sizes after the window-focus fit', () => {
    const reassertPtySizeAfterWindowWake = vi.fn()
    renderHook(() =>
      useTerminalWindowWakeRecovery({
        isVisible: true,
        managerRef: { current: manager },
        isActiveRef: { current: true },
        isVisibleRef: { current: true },
        panePtyBindingsRef: {
          current: new Map([[1, { dispose: vi.fn(), reassertPtySizeAfterWindowWake }]]) as never
        }
      })
    )

    window.dispatchEvent(new Event('focus'))

    expect(reassertPtySizeAfterWindowWake).toHaveBeenCalledTimes(1)
    expect(recoverVisibleTerminalWindowWakeMock.mock.invocationCallOrder[0]).toBeLessThan(
      reassertPtySizeAfterWindowWake.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    )
  })

  it('reasserts once after the settled fit when animation frames are available', () => {
    const scheduled: { settle: FrameRequestCallback | null } = { settle: null }
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      scheduled.settle = callback
      return 1
    })
    const reassertPtySizeAfterWindowWake = vi.fn()
    renderHook(() =>
      useTerminalWindowWakeRecovery({
        isVisible: true,
        managerRef: { current: manager },
        isActiveRef: { current: true },
        isVisibleRef: { current: true },
        panePtyBindingsRef: {
          current: new Map([[1, { dispose: vi.fn(), reassertPtySizeAfterWindowWake }]]) as never
        }
      })
    )

    window.dispatchEvent(new Event('focus'))
    expect(reassertPtySizeAfterWindowWake).not.toHaveBeenCalled()
    expect(scheduled.settle).not.toBeNull()

    scheduled.settle?.(performance.now())

    expect(reassertPtySizeAfterWindowWake).toHaveBeenCalledTimes(1)
    expect(recoverVisibleTerminalWindowWakeMock.mock.invocationCallOrder.at(-1)).toBeLessThan(
      reassertPtySizeAfterWindowWake.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    )
  })

  it('unsubscribes from the system resume event on cleanup', () => {
    const { unmount } = renderWakeRecoveryHook()
    expect(onSystemResumed).toHaveBeenCalledTimes(1)

    unmount()

    expect(unsubscribeSystemResumed).toHaveBeenCalledTimes(1)
  })

  it('does not subscribe while the terminal surface is hidden', () => {
    renderWakeRecoveryHook(false)

    expect(onSystemResumed).not.toHaveBeenCalled()
  })
})
