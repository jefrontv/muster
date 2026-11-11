import { describe, expect, it, vi } from 'vitest'
import { UI_ZOOM_APPLIED_EVENT } from '@/lib/ui-zoom'
import { syncBotsWebviewZoom } from './bots-webview-zoom'

function fakeTarget() {
  const listeners = new Map<string, () => void>()
  return {
    listeners,
    addEventListener: vi.fn((name: string, fn: () => void) => listeners.set(name, fn)),
    removeEventListener: vi.fn((name: string) => listeners.delete(name))
  }
}

describe('syncBotsWebviewZoom', () => {
  it('applies the UI zoom once the guest is ready and on every change', () => {
    const webview = { ...fakeTarget(), setZoomFactor: vi.fn() }
    const host = fakeTarget()
    let factor = 1.2
    const stop = syncBotsWebviewZoom(webview as never, () => factor, host as never)
    host.listeners.get(UI_ZOOM_APPLIED_EVENT)!()
    expect(webview.setZoomFactor).not.toHaveBeenCalled()
    webview.listeners.get('dom-ready')!()
    expect(webview.setZoomFactor).toHaveBeenLastCalledWith(1.2)
    factor = 1.44
    host.listeners.get(UI_ZOOM_APPLIED_EVENT)!()
    expect(webview.setZoomFactor).toHaveBeenLastCalledWith(1.44)
    stop()
    expect(host.listeners.size).toBe(0)
    expect(webview.listeners.size).toBe(0)
  })
})
