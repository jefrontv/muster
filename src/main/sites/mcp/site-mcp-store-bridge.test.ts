import { describe, expect, it, vi } from 'vitest'
import type { Site } from '../../../shared/site-types'
import type { SiteMcpStore } from './site-mcp-context'
import { updateSiteThroughBridge, type SiteWriteBridgeTransport } from './site-mcp-store-bridge'

function site(overrides: Partial<Site> = {}): Site {
  return {
    id: 's1',
    displayName: 'Acme',
    path: '/Sites/acme',
    environments: {},
    activeEnvironment: 'main',
    ...overrides
  } as Site
}

function fakeStore(): SiteMcpStore & { calls: { siteId: string }[] } {
  const calls: { siteId: string }[] = []
  return {
    calls,
    listSites: () => [site()],
    getSite: () => site(),
    findSiteByPath: () => site(),
    updateSite: (siteId) => {
      calls.push({ siteId })
      return site({ displayName: 'written-to-disk' })
    }
  }
}

function transport(overrides: Partial<SiteWriteBridgeTransport> = {}): SiteWriteBridgeTransport {
  return {
    readEndpoint: () => ({ port: 1234, token: 't', pid: 1 }),
    post: async () => site({ displayName: 'written-through-gui' }),
    ...overrides
  }
}

describe('updateSiteThroughBridge', () => {
  it('routes the write through the running GUI', async () => {
    const store = fakeStore()
    const post = vi.fn(async () => site({ displayName: 'written-through-gui' }))
    const result = await updateSiteThroughBridge(
      store,
      { siteId: 's1', updates: { displayName: 'Next' }, bridgeFile: '/tmp/bridge.json' },
      transport({ post })
    )
    expect(result?.displayName).toBe('written-through-gui')
    expect(post).toHaveBeenCalledWith(
      { port: 1234, token: 't', pid: 1 },
      { siteId: 's1', updates: { displayName: 'Next' } }
    )
    // The GUI owns the write; this process must not also touch the file.
    expect(store.calls).toEqual([])
  })

  it('writes to disk when no GUI is running', async () => {
    const store = fakeStore()
    const result = await updateSiteThroughBridge(
      store,
      { siteId: 's1', updates: {}, bridgeFile: '/tmp/bridge.json' },
      transport({ readEndpoint: () => null })
    )
    expect(result?.displayName).toBe('written-to-disk')
    expect(store.calls).toEqual([{ siteId: 's1' }])
  })

  it('falls back to disk when the bridge is unreachable', async () => {
    const store = fakeStore()
    // A stale endpoint file outlives the GUI that wrote it; the write must still land.
    const result = await updateSiteThroughBridge(
      store,
      { siteId: 's1', updates: {}, bridgeFile: '/tmp/bridge.json' },
      transport({ post: async () => null })
    )
    expect(result?.displayName).toBe('written-to-disk')
    expect(store.calls).toEqual([{ siteId: 's1' }])
  })
})
