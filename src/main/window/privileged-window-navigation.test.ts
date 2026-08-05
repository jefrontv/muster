import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { WebContents } from 'electron'

// Why vi.hoisted: vi.mock is hoisted above these declarations, so a plain const
// is still in its temporal dead zone when the factory runs.
const { openExternalMock, isMock } = vi.hoisted(() => ({
  openExternalMock: vi.fn(),
  isMock: { dev: false }
}))

vi.mock('electron', () => ({
  shell: { openExternal: openExternalMock },
  app: { getPath: () => '/tmp/orca-test-userdata' }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: isMock }))

import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'

type NavigationHarness = {
  contents: WebContents
  send: ReturnType<typeof vi.fn>
  openWindow: (url: string) => { action: string }
  navigate: (url: string) => { defaultPrevented: boolean }
}

function createHarness(destroyed = false): NavigationHarness {
  const send = vi.fn()
  let windowOpenHandler: (details: { url: string }) => { action: string } = () => ({
    action: 'deny'
  })
  let willNavigate: ((event: { preventDefault: () => void }, url: string) => void) | null = null

  const contents = {
    send,
    isDestroyed: () => destroyed,
    setWindowOpenHandler: (handler: (details: { url: string }) => { action: string }) => {
      windowOpenHandler = handler
    },
    on: (
      channel: string,
      listener: (event: { preventDefault: () => void }, url: string) => void
    ) => {
      if (channel === 'will-navigate') {
        willNavigate = listener
      }
    }
  } as unknown as WebContents

  return {
    contents,
    send,
    openWindow: (url) => windowOpenHandler({ url }),
    navigate: (url) => {
      let defaultPrevented = false
      willNavigate?.({ preventDefault: () => (defaultPrevented = true) }, url)
      return { defaultPrevented }
    }
  }
}

describe('installPrivilegedWindowNavigationPolicy', () => {
  beforeEach(() => {
    openExternalMock.mockClear()
    isMock.dev = false
  })

  it('forwards window.open links to the renderer instead of the OS browser', () => {
    const harness = createHarness()
    installPrivilegedWindowNavigationPolicy(harness.contents)

    expect(harness.openWindow('https://app.activecollab.com/1/tasks/2')).toEqual({ action: 'deny' })
    expect(harness.send).toHaveBeenCalledWith('browser:open-link-in-orca-tab', {
      browserPageId: null,
      url: 'https://app.activecollab.com/1/tasks/2'
    })
    expect(openExternalMock).not.toHaveBeenCalled()
  })

  it('forwards anchor navigation to the renderer and still blocks the navigation', () => {
    const harness = createHarness()
    installPrivilegedWindowNavigationPolicy(harness.contents)

    expect(harness.navigate('https://example.com/task').defaultPrevented).toBe(true)
    expect(harness.send).toHaveBeenCalledWith('browser:open-link-in-orca-tab', {
      browserPageId: null,
      url: 'https://example.com/task'
    })
  })

  it('uses the OS browser for renderers without a tab model', () => {
    const harness = createHarness()
    installPrivilegedWindowNavigationPolicy(harness.contents, { routeLinksToRenderer: false })

    harness.openWindow('https://example.com/')

    expect(harness.send).not.toHaveBeenCalled()
    expect(openExternalMock).toHaveBeenCalledWith('https://example.com/')
  })

  it('falls back to the OS browser when the renderer is gone', () => {
    const harness = createHarness(true)
    installPrivilegedWindowNavigationPolicy(harness.contents)

    harness.openWindow('https://example.com/')

    expect(harness.send).not.toHaveBeenCalled()
    expect(openExternalMock).toHaveBeenCalledWith('https://example.com/')
  })

  it('ignores file: targets on both paths', () => {
    const harness = createHarness()
    installPrivilegedWindowNavigationPolicy(harness.contents)

    harness.openWindow('file:///etc/passwd')
    expect(harness.navigate('file:///etc/passwd').defaultPrevented).toBe(true)

    expect(harness.send).not.toHaveBeenCalled()
    expect(openExternalMock).not.toHaveBeenCalled()
  })

  it('allows dev-server same-origin navigation through untouched', () => {
    isMock.dev = true
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
    const harness = createHarness()
    installPrivilegedWindowNavigationPolicy(harness.contents)

    expect(harness.navigate('http://localhost:5173/index.html').defaultPrevented).toBe(false)
    expect(harness.send).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
