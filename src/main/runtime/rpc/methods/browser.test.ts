import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import {
  CLIPBOARD_TEXT_MEASURE_YIELD_CODE_UNITS,
  CLIPBOARD_TEXT_WRITE_MAX_BYTES,
  CLIPBOARD_TEXT_WRITE_TOO_LARGE_ERROR
} from '../../../../shared/clipboard-text'
import { BROWSER_CORE_METHODS } from './browser-core'
import { BROWSER_EXTRA_METHODS } from './browser-extras'
import { BROWSER_SCREENCAST_METHODS } from './browser-screencast'
import { ClipboardWrite, KeyboardInsert } from './browser-schemas'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

describe('browser RPC methods', () => {
  it('routes core browser commands to the runtime server', async () => {
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      browserGoto: vi.fn().mockResolvedValue({ url: 'https://example.com' }),
      browserProfileDetectBrowsers: vi.fn().mockResolvedValue({ browsers: [] }),
      browserProfileImportFromBrowser: vi.fn().mockResolvedValue({ ok: false, reason: 'empty' }),
      browserTabCreate: vi.fn().mockResolvedValue({ browserPageId: 'page-1' }),
      browserTabSwitch: vi.fn().mockResolvedValue({ browserPageId: 'page-1' })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: BROWSER_CORE_METHODS })

    await dispatcher.dispatch(
      makeRequest('browser.goto', {
        worktree: 'id:wt-1',
        page: 'page-1',
        url: 'https://example.com'
      })
    )
    await dispatcher.dispatch(
      makeRequest('browser.tabCreate', {
        worktree: 'id:wt-1',
        url: 'https://example.com',
        profileId: 'profile-1'
      })
    )
    await dispatcher.dispatch(
      makeRequest('browser.tabSwitch', {
        worktree: 'id:wt-1',
        index: 0,
        focus: true
      })
    )
    await dispatcher.dispatch(makeRequest('browser.profileDetectBrowsers'))
    await dispatcher.dispatch(
      makeRequest('browser.profileImportFromBrowser', {
        profileId: 'profile-1',
        browserFamily: 'chrome',
        browserProfile: 'Default'
      })
    )

    expect(runtime.browserGoto).toHaveBeenCalledWith({
      worktree: 'id:wt-1',
      page: 'page-1',
      url: 'https://example.com'
    })
    expect(runtime.browserTabCreate).toHaveBeenCalledWith({
      worktree: 'id:wt-1',
      url: 'https://example.com',
      profileId: 'profile-1'
    })
    expect(runtime.browserTabSwitch).toHaveBeenCalledWith({
      worktree: 'id:wt-1',
      index: 0,
      focus: true
    })
    expect(runtime.browserProfileDetectBrowsers).toHaveBeenCalled()
    expect(runtime.browserProfileImportFromBrowser).toHaveBeenCalledWith({
      profileId: 'profile-1',
      browserFamily: 'chrome',
      browserProfile: 'Default'
    })
  })

  // Why: agent-only automation methods were removed; the runtime must reject them
  // outright rather than silently accept a call no handler serves.
  it('no longer exposes agent-only browser automation methods', async () => {
    const runtime = { getRuntimeId: () => 'test-runtime' } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({
      runtime,
      methods: [...BROWSER_CORE_METHODS, ...BROWSER_EXTRA_METHODS]
    })

    for (const method of [
      'browser.snapshot',
      'browser.click',
      'browser.fill',
      'browser.type',
      'browser.screenshot',
      'browser.exec',
      'browser.intercept.enable',
      'browser.storage.local.set',
      'browser.setDevice'
    ]) {
      const response = await dispatcher.dispatch(makeRequest(method, { page: 'page-1' }))
      expect(response, method).toMatchObject({ ok: false })
    }
  })

  it('routes browser screencast over the streaming dispatcher', async () => {
    const sendBinary = vi.fn()
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      browserScreencast: vi.fn(
        async (_params: unknown, options: { emit: (result: unknown) => void }) => {
          options.emit({ type: 'end', subscriptionId: 'browser-screencast:page-1:test' })
        }
      )
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: BROWSER_SCREENCAST_METHODS })
    const replies: string[] = []

    await dispatcher.dispatchStreaming(
      makeRequest('browser.screencast', {
        worktree: 'id:wt-1',
        page: 'page-1',
        format: 'jpeg',
        quality: 80,
        maxWidth: 1024,
        viewportWidth: 900,
        viewportHeight: 600
      }),
      (reply) => replies.push(reply),
      { connectionId: 'conn-1', sendBinary }
    )

    expect(runtime.browserScreencast).toHaveBeenCalledWith(
      {
        worktree: 'id:wt-1',
        page: 'page-1',
        format: 'jpeg',
        quality: 80,
        maxWidth: 1024,
        viewportWidth: 900,
        viewportHeight: 600
      },
      {
        connectionId: 'conn-1',
        sendBinary,
        signal: undefined,
        emit: expect.any(Function)
      }
    )
    expect(JSON.parse(replies[0])).toMatchObject({
      ok: true,
      streaming: true,
      result: { type: 'end', subscriptionId: 'browser-screencast:page-1:test' }
    })
  })

  it('routes browser screencast unsubscribe to runtime cleanup', async () => {
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      cleanupSubscription: vi.fn()
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: BROWSER_SCREENCAST_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('browser.screencast.unsubscribe', {
        subscriptionId: 'browser-screencast:page-1:test'
      })
    )

    expect(runtime.cleanupSubscription).toHaveBeenCalledWith('browser-screencast:page-1:test')
    expect(response).toMatchObject({
      ok: true,
      result: { unsubscribed: true }
    })
  })

  it('routes browser session and environment controls to the runtime server', async () => {
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      browserCookieGet: vi.fn().mockResolvedValue({ cookies: [] }),
      browserSetViewport: vi.fn().mockResolvedValue({ ok: true }),
      browserMouseWheel: vi.fn().mockResolvedValue({ ok: true })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: BROWSER_EXTRA_METHODS })

    await dispatcher.dispatch(
      makeRequest('browser.cookie.get', {
        worktree: 'id:wt-1',
        page: 'page-1',
        url: 'https://example.com'
      })
    )
    await dispatcher.dispatch(
      makeRequest('browser.viewport', {
        worktree: 'id:wt-1',
        page: 'page-1',
        width: 1024,
        height: 768
      })
    )
    await dispatcher.dispatch(
      makeRequest('browser.mouseWheel', {
        worktree: 'id:wt-1',
        page: 'page-1',
        dy: 240
      })
    )

    expect(runtime.browserCookieGet).toHaveBeenCalledWith({
      worktree: 'id:wt-1',
      page: 'page-1',
      url: 'https://example.com'
    })
    expect(runtime.browserSetViewport).toHaveBeenCalledWith({
      worktree: 'id:wt-1',
      page: 'page-1',
      width: 1024,
      height: 768
    })
    expect(runtime.browserMouseWheel).toHaveBeenCalledWith({
      worktree: 'id:wt-1',
      page: 'page-1',
      dy: 240
    })
  })

  it('rejects oversized browser clipboard writes before runtime dispatch', async () => {
    const secret = 'browser-secret-token'
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      browserClipboardWrite: vi.fn().mockResolvedValue({ ok: true })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: BROWSER_EXTRA_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('browser.clipboardWrite', {
        page: 'page-1',
        text: secret + 'x'.repeat(CLIPBOARD_TEXT_WRITE_MAX_BYTES + 1)
      })
    )

    expect(response).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_argument',
        message: CLIPBOARD_TEXT_WRITE_TOO_LARGE_ERROR
      }
    })
    expect(JSON.stringify(response)).not.toContain(secret)
    expect(runtime.browserClipboardWrite).not.toHaveBeenCalled()
  })

  it('leaves browser text byte limits to async handlers', () => {
    const text = 'x'.repeat(CLIPBOARD_TEXT_WRITE_MAX_BYTES + 1)

    expect(KeyboardInsert.safeParse({ text }).success).toBe(true)
    expect(ClipboardWrite.safeParse({ text }).success).toBe(true)
  })

  it('yields while validating large accepted browser text insertion before dispatch', async () => {
    vi.useFakeTimers()
    try {
      const text = 'é'.repeat(CLIPBOARD_TEXT_MEASURE_YIELD_CODE_UNITS + 1)
      const runtime = {
        getRuntimeId: () => 'test-runtime',
        browserKeyboardInsertText: vi.fn().mockResolvedValue({ inserted: true })
      } as unknown as OrcaRuntimeService
      const dispatcher = new RpcDispatcher({ runtime, methods: BROWSER_CORE_METHODS })

      const responsePromise = dispatcher.dispatch(
        makeRequest('browser.keyboardInsertText', { text })
      )
      await Promise.resolve()

      expect(runtime.browserKeyboardInsertText).not.toHaveBeenCalled()

      await vi.runOnlyPendingTimersAsync()
      const response = await responsePromise

      expect(response).toMatchObject({
        ok: true,
        result: { inserted: true }
      })
      expect(runtime.browserKeyboardInsertText).toHaveBeenCalledWith({ text })
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects oversized browser text insertion before runtime dispatch', async () => {
    const secret = 'browser-insert-secret'
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      browserKeyboardInsertText: vi.fn().mockResolvedValue({ inserted: true })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: BROWSER_CORE_METHODS })
    const text = [secret, 'x'.repeat(CLIPBOARD_TEXT_WRITE_MAX_BYTES + 1)].join('')

    const keyboardInsertResponse = await dispatcher.dispatch(
      makeRequest('browser.keyboardInsertText', { text })
    )

    expect(keyboardInsertResponse).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_argument',
        message: CLIPBOARD_TEXT_WRITE_TOO_LARGE_ERROR
      }
    })
    expect(JSON.stringify(keyboardInsertResponse)).not.toContain(secret)
    expect(runtime.browserKeyboardInsertText).not.toHaveBeenCalled()
  })
})
