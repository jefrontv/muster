import { describe, expect, it, vi } from 'vitest'
import type { Site } from '../../../shared/site-types'
import {
  SiteBridgeRefusedError,
  updateSiteThroughBridge,
  type SiteWriteBridgeBody,
  type SiteWriteBridgeTransport
} from './site-mcp-store-bridge'

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

const endpoint = { port: 1234, token: 't', pid: 1 }
const args = { siteId: 's1', updates: { displayName: 'Next' }, bridgeFile: '/tmp/bridge.json' }

function transport(overrides: Partial<SiteWriteBridgeTransport> = {}): SiteWriteBridgeTransport {
  return {
    readEndpoint: () => endpoint,
    post: async () => ({ kind: 'applied', value: site({ displayName: 'written-through-gui' }) }),
    ...overrides
  }
}

describe('updateSiteThroughBridge', () => {
  it('routes the write, patches included, through the running GUI', async () => {
    const writeLocally = vi.fn(() => site())
    const post = vi.fn(async (_endpoint: unknown, _body: SiteWriteBridgeBody) => ({
      kind: 'applied' as const,
      value: site({ displayName: 'written-through-gui' })
    }))
    const environmentPatches = { main: { merge: { hostname: 'x.example' } } }

    const result = await updateSiteThroughBridge(
      { ...args, environmentPatches },
      writeLocally,
      transport({ post })
    )

    expect(result?.displayName).toBe('written-through-gui')
    expect(post).toHaveBeenCalledWith(endpoint, {
      siteId: 's1',
      updates: { displayName: 'Next' },
      environmentPatches
    })
    // The GUI owns the write; this process must not also touch the file.
    expect(writeLocally).not.toHaveBeenCalled()
  })

  it('writes the file itself when no GUI is running', async () => {
    const writeLocally = vi.fn(() => site({ displayName: 'written-to-disk' }))
    const result = await updateSiteThroughBridge(
      args,
      writeLocally,
      transport({ readEndpoint: () => null })
    )
    expect(result?.displayName).toBe('written-to-disk')
    expect(writeLocally).toHaveBeenCalledTimes(1)
  })

  it('writes the file itself when the endpoint is stale and nothing is listening', async () => {
    const writeLocally = vi.fn(() => site({ displayName: 'written-to-disk' }))
    const result = await updateSiteThroughBridge(
      args,
      writeLocally,
      transport({ post: async () => ({ kind: 'no-gui' }) })
    )
    expect(result?.displayName).toBe('written-to-disk')
  })

  it('refuses rather than writing around a GUI that is up but did not apply it', async () => {
    // The old fallback wrote to disk and reported success; the GUI's next save then reverted it.
    const writeLocally = vi.fn(() => site())
    await expect(
      updateSiteThroughBridge(
        args,
        writeLocally,
        transport({ post: async () => ({ kind: 'refused', detail: 'no answer within 5 s' }) })
      )
    ).rejects.toBeInstanceOf(SiteBridgeRefusedError)
    expect(writeLocally).not.toHaveBeenCalled()
  })
})
