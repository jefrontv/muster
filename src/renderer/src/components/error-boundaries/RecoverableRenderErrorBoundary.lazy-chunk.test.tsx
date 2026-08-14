// @vitest-environment happy-dom

import { Suspense, act, type ReactElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LAZY_CHUNK_RELOAD_GUARD_KEY, lazyWithRetry } from '@/lib/lazy-with-retry'
import { RecoverableRenderErrorBoundary } from './RecoverableRenderErrorBoundary'

const reportCrashMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/react-error-boundary-reporting', () => ({
  reportReactErrorBoundaryCrash: reportCrashMock
}))

const RELOAD_GUARD_KEY = LAZY_CHUNK_RELOAD_GUARD_KEY

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function createContainer(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return { container, root: createRoot(container) }
}

function BoundaryHarness({ children }: { children: ReactNode }): ReactElement {
  return (
    <RecoverableRenderErrorBoundary boundaryId="page.automations" surface="page">
      <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
    </RecoverableRenderErrorBoundary>
  )
}

async function flushReactWork(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('RecoverableRenderErrorBoundary lazy chunk containment', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    reportCrashMock.mockReset()
    window.sessionStorage.clear()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    if (root) {
      act(() => root?.unmount())
    }
    container?.remove()
    root = null
    container = null
    window.sessionStorage.clear()
    consoleError.mockRestore()
    vi.restoreAllMocks()
  })

  it('renders the fallback without reporting after guarded dynamic import exhaustion', async () => {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
    const LazyRejectingImport = lazyWithRetry(
      () =>
        Promise.reject(
          new TypeError('Failed to fetch dynamically imported module: file://redacted/chunk.js')
        ),
      { retries: 0 }
    )
    ;({ container, root } = createContainer())

    await act(async () => {
      root?.render(
        <BoundaryHarness>
          <LazyRejectingImport />
        </BoundaryHarness>
      )
    })
    await flushReactWork()
    await flushReactWork()

    expect(container?.querySelector('[role="alert"]')).not.toBeNull()
    expect(reportCrashMock).not.toHaveBeenCalled()
  })

  it('hard-reloads on Retry for an exhausted lazy chunk instead of remounting the dead import', async () => {
    const reload = vi.fn()
    vi.spyOn(window.location, 'reload').mockImplementation(reload)
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
    const LazyRejectingImport = lazyWithRetry(
      () =>
        Promise.reject(
          new TypeError('Failed to fetch dynamically imported module: file://redacted/chunk.js')
        ),
      { retries: 0 }
    )
    ;({ container, root } = createContainer())

    await act(async () => {
      root?.render(
        <BoundaryHarness>
          <LazyRejectingImport />
        </BoundaryHarness>
      )
    })
    await flushReactWork()
    await flushReactWork()

    const retry = [...(container?.querySelectorAll('button') ?? [])].find((button) =>
      /Retry/i.test(button.textContent ?? '')
    )
    expect(retry).toBeDefined()
    await act(async () => {
      retry?.click()
    })

    expect(reload).toHaveBeenCalledTimes(1)
    expect(window.sessionStorage.getItem(RELOAD_GUARD_KEY)).toBeNull()
  })

  it('still reports ordinary render errors', async () => {
    const error = new Error('ordinary render failure')
    function BrokenSurface(): ReactElement {
      throw error
    }
    ;({ container, root } = createContainer())

    await act(async () => {
      root?.render(
        <BoundaryHarness>
          <BrokenSurface />
        </BoundaryHarness>
      )
    })

    expect(container?.querySelector('[role="alert"]')).not.toBeNull()
    expect(reportCrashMock).toHaveBeenCalledTimes(1)
    expect(reportCrashMock).toHaveBeenCalledWith(
      expect.objectContaining({
        boundaryId: 'page.automations',
        surface: 'page',
        error
      })
    )
  })
})
