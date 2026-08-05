// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { useSiteRootsRefresh } from './use-site-roots-refresh'

function Harness(): null {
  useSiteRootsRefresh()
  return null
}

const roots: Root[] = []

async function render(): Promise<void> {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<Harness />)
  })
}

describe('useSiteRootsRefresh', () => {
  const fetchSites = vi.fn(async () => {})
  const fetchRepos = vi.fn(async () => {})

  beforeEach(() => {
    fetchSites.mockClear()
    fetchRepos.mockClear()
    useAppStore.setState({ fetchSites, fetchRepos })
    // @ts-expect-error test harness shim for the preload bridge
    window.api = { siteRoots: { onChanged: vi.fn(() => () => {}) } }
  })

  afterEach(async () => {
    for (const root of roots.splice(0)) {
      await act(async () => {
        root.unmount()
      })
    }
  })

  it('fetches sites once on mount so site identities exist before any focus/watch trigger', async () => {
    await render()

    expect(fetchSites).toHaveBeenCalledTimes(1)
    // Why: repos already load through the app's own startup path; mount must not double-fetch them.
    expect(fetchRepos).not.toHaveBeenCalled()
  })
})
