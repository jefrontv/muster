// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  consumeSystemBrowserClickEscape,
  installSystemBrowserClickEscapeTracking
} from './system-browser-click-escape'

function pointerDown(modifiers: {
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
}): void {
  window.dispatchEvent(new MouseEvent('pointerdown', modifiers))
}

describe('system browser click escape', () => {
  afterEach(() => {
    vi.useRealTimers()
    consumeSystemBrowserClickEscape()
  })

  it('reports no escape without a tracked click', () => {
    expect(consumeSystemBrowserClickEscape()).toBe(false)
  })

  it('detects shift+meta and shift+ctrl clicks', () => {
    const stop = installSystemBrowserClickEscapeTracking()

    pointerDown({ shiftKey: true, metaKey: true })
    expect(consumeSystemBrowserClickEscape()).toBe(true)

    pointerDown({ shiftKey: true, ctrlKey: true })
    expect(consumeSystemBrowserClickEscape()).toBe(true)

    stop()
  })

  it('ignores plain and single-modifier clicks', () => {
    const stop = installSystemBrowserClickEscapeTracking()

    pointerDown({})
    expect(consumeSystemBrowserClickEscape()).toBe(false)

    pointerDown({ metaKey: true })
    expect(consumeSystemBrowserClickEscape()).toBe(false)

    pointerDown({ shiftKey: true })
    expect(consumeSystemBrowserClickEscape()).toBe(false)

    stop()
  })

  it('consumes the escape once so a later link open is not affected', () => {
    const stop = installSystemBrowserClickEscapeTracking()

    pointerDown({ shiftKey: true, metaKey: true })
    expect(consumeSystemBrowserClickEscape()).toBe(true)
    expect(consumeSystemBrowserClickEscape()).toBe(false)

    stop()
  })

  it('expires a stale escape click', () => {
    vi.useFakeTimers()
    const stop = installSystemBrowserClickEscapeTracking()

    pointerDown({ shiftKey: true, metaKey: true })
    vi.advanceTimersByTime(2_500)

    expect(consumeSystemBrowserClickEscape()).toBe(false)
    stop()
  })

  it('stops tracking after teardown', () => {
    const stop = installSystemBrowserClickEscapeTracking()
    stop()

    pointerDown({ shiftKey: true, metaKey: true })
    expect(consumeSystemBrowserClickEscape()).toBe(false)
  })
})
