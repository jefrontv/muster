// Routes MCP site writes through the running GUI, falling back to this process's
// own disk write when no GUI is up.
//
// The fallback is the old behaviour, not a degraded guess: with no GUI running
// there is no stale in-memory state to be clobbered by, so writing the file
// directly is correct. The bridge only matters while both processes are alive.

import { readFileSync } from 'node:fs'
import type { Site } from '../../../shared/site-types'
import type { SiteWriteBridgeEndpoint } from '../site-write-bridge-server'
import type { SiteMcpStore } from './site-mcp-context'

const BRIDGE_REQUEST_TIMEOUT_MS = 5_000

export type SiteWriteBridgeTransport = {
  readEndpoint: () => SiteWriteBridgeEndpoint | null
  post: (
    endpoint: SiteWriteBridgeEndpoint,
    body: { siteId: string; updates: Partial<Omit<Site, 'id'>> }
  ) => Promise<Site | null>
}

function readEndpointFile(bridgeFile: string): SiteWriteBridgeEndpoint | null {
  try {
    const parsed = JSON.parse(readFileSync(bridgeFile, 'utf-8')) as Partial<SiteWriteBridgeEndpoint>
    if (typeof parsed.port !== 'number' || typeof parsed.token !== 'string' || parsed.port <= 0) {
      return null
    }
    return { port: parsed.port, token: parsed.token, pid: parsed.pid ?? 0 }
  } catch {
    // Missing or half-written: treat as no GUI and let the caller write to disk.
    return null
  }
}

async function postToBridge(
  endpoint: SiteWriteBridgeEndpoint,
  body: { siteId: string; updates: Partial<Omit<Site, 'id'>> }
): Promise<Site | null> {
  const controller = new AbortController()
  // A stale endpoint file can point at a dead port; never hang the agent's tool call.
  const timeout = setTimeout(() => controller.abort(), BRIDGE_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`http://127.0.0.1:${endpoint.port}/site/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-muster-site-bridge-token': endpoint.token
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    if (!response.ok) {
      return null
    }
    const payload = (await response.json()) as { site?: Site }
    return payload.site ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Applies a site write through the GUI when one is running, else through this
 * process's own store. Tools call this rather than `store.updateSite` directly —
 * `SiteMcpStore.updateSite` is synchronous and the bridge hop is not.
 */
export async function updateSiteThroughBridge(
  base: SiteMcpStore,
  args: { siteId: string; updates: Partial<Omit<Site, 'id'>>; bridgeFile: string },
  transport?: SiteWriteBridgeTransport
): Promise<Site | null> {
  const resolved: SiteWriteBridgeTransport = transport ?? {
    readEndpoint: () => readEndpointFile(args.bridgeFile),
    post: postToBridge
  }
  const endpoint = resolved.readEndpoint()
  if (endpoint) {
    const applied = await resolved.post(endpoint, { siteId: args.siteId, updates: args.updates })
    if (applied) {
      return applied
    }
  }
  // No GUI, or the GUI refused//timed out: this process owns the file.
  return base.updateSite(args.siteId, args.updates)
}
