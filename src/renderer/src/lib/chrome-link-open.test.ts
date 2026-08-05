// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { openChromeHttpLink } from './chrome-link-open'
import { registerHttpLinkStoreAccessor } from './http-link-routing'

const openUrl = vi.fn()

vi.stubGlobal('window', globalThis.window)

type TestStore = {
  activeWorktreeId: string | null
  activeView: string
  setActiveView: ReturnType<typeof vi.fn>
  createBrowserTab: ReturnType<typeof vi.fn>
  setActiveWorktree: ReturnType<typeof vi.fn>
  settings: Record<string, unknown>
  activeGroupIdByWorktree: Record<string, string | undefined>
  runtimeEnvironments?: unknown[]
}

function createStore(overrides: Partial<TestStore> = {}): TestStore {
  return {
    activeWorktreeId: 'wt-1',
    activeView: 'tasks',
    setActiveView: vi.fn(),
    createBrowserTab: vi.fn(),
    setActiveWorktree: vi.fn(),
    settings: { openLinksInApp: true },
    activeGroupIdByWorktree: {},
    ...overrides
  }
}

const FLOATING_ID = 'global-floating-terminal'

function createFloatingStore(settings: Record<string, unknown> = {}): TestStore {
  return createStore({
    settings: {
      openLinksInApp: true,
      openLinksInFloatingBrowser: true,
      floatingTerminalEnabled: true,
      ...settings
    }
  })
}

describe('openChromeHttpLink', () => {
  beforeEach(() => {
    openUrl.mockClear()
    // @ts-expect-error test harness shim for the preload bridge
    window.api = { shell: { openUrl } }
  })

  it('opens a tab and reveals the workspace view when clicked from Tasks', () => {
    const store = createStore()
    registerHttpLinkStoreAccessor(() => store as never)

    openChromeHttpLink(store as never, 'https://app.activecollab.com/1/tasks/718')

    expect(store.createBrowserTab).toHaveBeenCalledWith(
      'wt-1',
      'https://app.activecollab.com/1/tasks/718',
      { activate: true }
    )
    // The regression: without this the tab is created behind the task page.
    expect(store.setActiveView).toHaveBeenCalledWith('terminal')
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('leaves the view alone when already on the workspace surface', () => {
    const store = createStore({ activeView: 'terminal' })
    registerHttpLinkStoreAccessor(() => store as never)

    openChromeHttpLink(store as never, 'https://example.com/')

    expect(store.createBrowserTab).toHaveBeenCalled()
    expect(store.setActiveView).not.toHaveBeenCalled()
  })

  it('uses the system browser and keeps the view when in-app routing is off', () => {
    const store = createStore({ settings: { openLinksInApp: false } })
    registerHttpLinkStoreAccessor(() => store as never)

    openChromeHttpLink(store as never, 'https://example.com/')

    expect(store.createBrowserTab).not.toHaveBeenCalled()
    expect(store.setActiveView).not.toHaveBeenCalled()
    expect(openUrl).toHaveBeenCalledWith('https://example.com/')
  })

  it('uses the system browser when no workspace is active', () => {
    const store = createStore({ activeWorktreeId: null })
    registerHttpLinkStoreAccessor(() => store as never)

    openChromeHttpLink(store as never, 'https://example.com/')

    expect(store.createBrowserTab).not.toHaveBeenCalled()
    expect(store.setActiveView).not.toHaveBeenCalled()
    expect(openUrl).toHaveBeenCalledWith('https://example.com/')
  })

  it('opens in the floating panel without switching views when that option is on', () => {
    const store = createFloatingStore()
    registerHttpLinkStoreAccessor(() => store as never)
    const toggles = vi.fn()
    window.addEventListener('orca-toggle-floating-terminal', toggles)

    openChromeHttpLink(store as never, 'https://example.com/floating')

    expect(store.createBrowserTab).toHaveBeenCalledWith(
      FLOATING_ID,
      'https://example.com/floating',
      expect.objectContaining({ activate: true, browserRuntimeEnvironmentId: null })
    )
    // The floating panel overlays every surface, so the current view must stay put.
    expect(store.setActiveView).not.toHaveBeenCalled()
    expect(openUrl).not.toHaveBeenCalled()
    // A collapsed panel must be opened, or the new tab is invisible.
    expect(toggles).toHaveBeenCalledTimes(1)
    window.removeEventListener('orca-toggle-floating-terminal', toggles)
  })

  it('does not toggle an already-visible floating panel', () => {
    const store = createFloatingStore()
    registerHttpLinkStoreAccessor(() => store as never)
    document.body.innerHTML = '<div data-floating-terminal-panel aria-hidden="false"></div>'
    const toggles = vi.fn()
    window.addEventListener('orca-toggle-floating-terminal', toggles)

    openChromeHttpLink(store as never, 'https://example.com/already-open')

    expect(store.createBrowserTab).toHaveBeenCalled()
    // Toggling a visible panel would close it and hide the tab that was just opened.
    expect(toggles).not.toHaveBeenCalled()
    window.removeEventListener('orca-toggle-floating-terminal', toggles)
    document.body.innerHTML = ''
  })

  it('routes to the floating panel even while a remote runtime is active', () => {
    const store = createFloatingStore({ activeRuntimeEnvironmentId: 'env-1' })
    registerHttpLinkStoreAccessor(() => store as never)

    openChromeHttpLink(store as never, 'https://example.com/remote')

    expect(store.createBrowserTab).toHaveBeenCalledWith(
      FLOATING_ID,
      'https://example.com/remote',
      expect.objectContaining({ browserRuntimeEnvironmentId: null })
    )
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('falls back to a workspace tab when the floating workspace is disabled', () => {
    const store = createFloatingStore({ floatingTerminalEnabled: false })
    registerHttpLinkStoreAccessor(() => store as never)

    openChromeHttpLink(store as never, 'https://example.com/no-floating')

    expect(store.createBrowserTab).toHaveBeenCalledWith('wt-1', 'https://example.com/no-floating', {
      activate: true
    })
    expect(store.setActiveView).toHaveBeenCalledWith('terminal')
  })

  it('uses the system browser for a remote-runtime workspace', () => {
    const store = createStore({
      settings: { openLinksInApp: true, activeRuntimeEnvironmentId: 'env-1' }
    })
    registerHttpLinkStoreAccessor(() => store as never)

    openChromeHttpLink(store as never, 'https://example.com/')

    expect(store.createBrowserTab).not.toHaveBeenCalled()
    expect(openUrl).toHaveBeenCalledWith('https://example.com/')
  })
})
