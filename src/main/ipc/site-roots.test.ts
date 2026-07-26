import type { WebContents } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteDiscoveryResult, SiteRootsChangedEvent } from '../../shared/site-discovery-types'
import type { Store } from '../persistence'

const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
const quitHandlers: (() => void)[] = []

vi.mock('electron', () => ({
  app: {
    once: (channel: string, handler: () => void) => {
      if (channel === 'will-quit') {
        quitHandlers.push(handler)
      }
    }
  },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel)
    }
  }
}))

// The scanner has its own tests; here it only has to prove that the handler hands it the derived
// roots and the configured site paths.
const discoverMock = vi.fn()
vi.mock('../sites/site-candidate-discovery', () => ({
  discoverSiteCandidates: (args: unknown) => discoverMock(args)
}))

import { registerSiteRootsHandlers, subscribeSiteRootsEvents } from './site-roots'

type Sender = {
  isDestroyed: () => boolean
  send: (channel: string, event: SiteRootsChangedEvent) => void
  once: (channel: string, listener: () => void) => void
}

let sent: { channel: string; event: SiteRootsChangedEvent }[] = []
let destroyed = false

function sender(): Sender {
  return {
    isDestroyed: () => destroyed,
    send: (channel, event) => sent.push({ channel, event }),
    once: () => {}
  }
}

// Only the two readers the roots surface touches; the rest of Store is irrelevant here.
function store(repoPaths: string[] = [], sitePaths: string[] = []): Store {
  return {
    getRepos: () => repoPaths.map((path) => ({ path })),
    listSites: () => sitePaths.map((path) => ({ path }))
  } as unknown as Store
}

async function invoke<T>(channel: string, sendingTo: Sender = sender()): Promise<T> {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`No handler registered for ${channel}`)
  }
  return (await handler({ sender: sendingTo })) as T
}

const EMPTY_DISCOVERY: SiteDiscoveryResult = {
  roots: [],
  candidates: [],
  scannedAt: 0,
  truncated: false
}

beforeEach(() => {
  handlers.clear()
  sent = []
  destroyed = false
  discoverMock.mockResolvedValue(EMPTY_DISCOVERY)
})

afterEach(() => {
  // Stops the watcher the way production does, so no sweep interval outlives the test file.
  for (const handler of quitHandlers) {
    handler()
  }
  vi.clearAllMocks()
})

describe('registerSiteRootsHandlers', () => {
  it('registers every channel', () => {
    registerSiteRootsHandlers(store())

    expect([...handlers.keys()].sort()).toEqual([
      'siteRoots:discover',
      'siteRoots:list',
      'siteRoots:refresh'
    ])
  })

  it('hands the scanner the derived roots and the configured site paths', async () => {
    // The paths do not exist, so no root survives derivation — which is exactly the contract the
    // scanner has to tolerate, and it keeps the test off the real filesystem.
    registerSiteRootsHandlers(store(['/nowhere/api'], ['/nowhere/acme']))

    expect(await invoke('siteRoots:list')).toEqual({ ok: true, value: [] })
    expect(await invoke('siteRoots:discover')).toEqual({ ok: true, value: EMPTY_DISCOVERY })
    expect(discoverMock).toHaveBeenCalledWith({ roots: [], configuredPaths: ['/nowhere/acme'] })
  })

  it('returns a tagged failure instead of throwing when a scan blows up', async () => {
    discoverMock.mockRejectedValue(new Error('scan exploded'))
    registerSiteRootsHandlers(store())

    expect(await invoke('siteRoots:discover')).toEqual({ ok: false, error: 'scan exploded' })
  })

  it('pushes a sweep to subscribers when a refresh finds the same roots', async () => {
    registerSiteRootsHandlers(store())
    const renderer = sender()
    await invoke('siteRoots:list', renderer)

    expect(await invoke('siteRoots:refresh', renderer)).toEqual({ ok: true, value: false })
    expect(sent.map((entry) => entry.channel)).toEqual(['siteRoots:changed'])
    expect(sent[0].event.reason).toBe('sweep')
  })

  it('stops sending to a destroyed renderer', async () => {
    registerSiteRootsHandlers(store())
    subscribeSiteRootsEvents(sender() as unknown as WebContents)

    destroyed = true
    await invoke('siteRoots:refresh')

    expect(sent).toEqual([])
  })
})
