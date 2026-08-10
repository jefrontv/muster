import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WebContents } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  SiteDiscoveryResult,
  SiteRootEntry,
  SiteRootsChangedEvent
} from '../../shared/site-discovery-types'
import type { SiteResult } from '../../shared/site-types'
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

// Only the readers and the one writer the roots surface touches; the rest of Store is irrelevant.
// The configured list is real state so add/remove/reorder can be driven end to end.
function store(
  repoPaths: string[] = [],
  sitePaths: string[] = [],
  configured: string[] = []
): Store {
  let roots = [...configured]
  return {
    getRepos: () => repoPaths.map((path) => ({ path })),
    listSites: () => sitePaths.map((path) => ({ path })),
    getConfiguredSiteRoots: () => roots,
    setConfiguredSiteRoots: (next: readonly string[]) => {
      roots = [...next]
    }
  } as unknown as Store
}

async function invoke<T>(
  channel: string,
  args?: unknown,
  sendingTo: Sender = sender()
): Promise<T> {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`No handler registered for ${channel}`)
  }
  return (await handler({ sender: sendingTo }, args)) as T
}

// Real directories under os.tmpdir(): add() validates against the filesystem, so a fake path would
// only ever exercise the rejection branch. Nothing here touches the operator's own folders.
let workspace = ''

function directory(name: string): string {
  const path = join(workspace, name)
  mkdirSync(path, { recursive: true })
  return path
}

const EMPTY_DISCOVERY: SiteDiscoveryResult = {
  roots: [],
  primaryRoot: '',
  candidates: [],
  scannedAt: 0,
  truncated: false
}

beforeEach(() => {
  handlers.clear()
  sent = []
  destroyed = false
  workspace = mkdtempSync(join(tmpdir(), 'muster-roots-ipc-'))
  discoverMock.mockResolvedValue(EMPTY_DISCOVERY)
})

afterEach(() => {
  // Stops the watcher the way production does, so no sweep interval outlives the test file.
  for (const handler of quitHandlers) {
    handler()
  }
  rmSync(workspace, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('registerSiteRootsHandlers', () => {
  it('registers every channel', () => {
    registerSiteRootsHandlers(store())

    expect([...handlers.keys()].sort()).toEqual([
      'siteRoots:add',
      'siteRoots:configured',
      'siteRoots:discover',
      'siteRoots:list',
      'siteRoots:primary',
      'siteRoots:refresh',
      'siteRoots:remove',
      'siteRoots:reorder'
    ])
  })

  it('hands the scanner the derived roots, the densest one, and the configured site paths', async () => {
    // The paths do not exist, so no root survives derivation — which is exactly the contract the
    // scanner has to tolerate, and it keeps the test off the real filesystem.
    registerSiteRootsHandlers(store(['/nowhere/api'], ['/nowhere/acme']))

    expect(await invoke('siteRoots:list')).toEqual({ ok: true, value: [] })
    expect(await invoke('siteRoots:discover')).toEqual({ ok: true, value: EMPTY_DISCOVERY })
    expect(discoverMock).toHaveBeenCalledWith({
      roots: [],
      primaryRoot: '',
      configuredPaths: ['/nowhere/acme']
    })
  })

  it('returns a tagged failure instead of throwing when a scan blows up', async () => {
    discoverMock.mockRejectedValue(new Error('scan exploded'))
    registerSiteRootsHandlers(store())

    expect(await invoke('siteRoots:discover')).toEqual({ ok: false, error: 'scan exploded' })
  })

  it('pushes a sweep to subscribers when a refresh finds the same roots', async () => {
    registerSiteRootsHandlers(store())
    const renderer = sender()
    await invoke('siteRoots:list', undefined, renderer)

    expect(await invoke('siteRoots:refresh', undefined, renderer)).toEqual({
      ok: true,
      value: false
    })
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

  it('scans the configured list instead of the derived parents once one exists', async () => {
    const sites = directory('Sites')
    registerSiteRootsHandlers(store(['/nowhere/api'], ['/nowhere/acme'], [sites]))

    expect(await invoke('siteRoots:list')).toEqual({ ok: true, value: [sites] })
    await invoke('siteRoots:discover')
    expect(discoverMock).toHaveBeenCalledWith({
      roots: [sites],
      primaryRoot: sites,
      configuredPaths: ['/nowhere/acme']
    })
  })

  it('adds a folder, reports it back, and re-scans for every listening renderer', async () => {
    const sites = directory('Sites')
    registerSiteRootsHandlers(store())
    const renderer = sender()
    await invoke('siteRoots:configured', undefined, renderer)

    expect(await invoke('siteRoots:add', sites, renderer)).toEqual({
      ok: true,
      value: [{ path: sites, missing: false }]
    })
    expect(await invoke('siteRoots:list', undefined, renderer)).toEqual({
      ok: true,
      value: [sites]
    })
    expect(sent.map((entry) => entry.event.reason)).toEqual(['roots-changed'])
  })

  it('reports a rejected add as a tagged failure and leaves the list alone', async () => {
    const file = join(directory('Sites'), 'notes.txt')
    writeFileSync(file, 'not a folder')
    registerSiteRootsHandlers(store())

    expect(await invoke('siteRoots:add', file)).toEqual({
      ok: false,
      error: `Not a folder: ${file}`
    })
    expect(await invoke('siteRoots:configured')).toEqual({ ok: true, value: [] })
  })

  it('removes and reorders by path, answering with the new list each time', async () => {
    const first = directory('first')
    const second = directory('second')
    const third = directory('third')
    registerSiteRootsHandlers(store([], [], [first, second, third]))

    const reordered = await invoke<SiteResult<SiteRootEntry[]>>('siteRoots:reorder', {
      path: third,
      toIndex: 0
    })
    expect(reordered.ok && reordered.value.map((entry) => entry.path)).toEqual([
      third,
      first,
      second
    ])

    const removed = await invoke<SiteResult<SiteRootEntry[]>>('siteRoots:remove', first)
    expect(removed.ok && removed.value.map((entry) => entry.path)).toEqual([third, second])
    expect(await invoke('siteRoots:list')).toEqual({ ok: true, value: [third, second] })
  })

  it('rejects a malformed write instead of letting it reach the store', async () => {
    const sites = directory('Sites')
    registerSiteRootsHandlers(store([], [], [sites]))

    expect(await invoke('siteRoots:add', 42)).toEqual({ ok: false, error: 'Invalid folder path.' })
    expect(await invoke('siteRoots:remove', null)).toEqual({
      ok: false,
      error: 'Invalid folder path.'
    })
    expect(await invoke('siteRoots:reorder', { path: sites })).toEqual({
      ok: false,
      error: 'Invalid reorder request.'
    })
    expect(await invoke('siteRoots:configured')).toEqual({
      ok: true,
      value: [{ path: sites, missing: false }]
    })
  })

  it('keeps an unreachable configured root listed, marked, and still scanned', async () => {
    const volume = directory('ejected-volume')
    registerSiteRootsHandlers(store([], [], [volume]))
    rmSync(volume, { recursive: true, force: true })

    expect(await invoke('siteRoots:configured')).toEqual({
      ok: true,
      value: [{ path: volume, missing: true }]
    })
    expect(await invoke('siteRoots:list')).toEqual({ ok: true, value: [volume] })
  })
})
