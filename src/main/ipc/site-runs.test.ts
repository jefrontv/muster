import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WebContents } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteRunEvent } from '../../shared/site-run-types'
import type { Site, SiteSummary } from '../../shared/site-types'
import type { Store } from '../persistence'

const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
let userDataDir = ''

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel)
    }
  }
}))

// The real summary shells out to git and reads the safeStorage secret files; neither is what
// these tests are about.
const buildSiteSummaryMock = vi.fn()
vi.mock('../sites/site-summary', () => ({
  buildSiteSummary: (site: Site) => buildSiteSummaryMock(site)
}))

import { SiteRunCancelledError } from '../sites/pipeline-contract'
import {
  getSiteRunService,
  registerSiteRunHandlers,
  subscribeSiteRunEvents,
  type SiteRunJobFactory
} from './site-runs'

// A scripted stand-in for the real import/deploy pipelines. It announces a stage, emits progress,
// then parks on the abort signal, so these tests exercise the IPC seam (streaming, remount
// recovery, cancellation, persistence) without reaching SSH, MySQL, or the filesystem.
const scriptedJob: SiteRunJobFactory = () => async (context) => {
  context.status('Connecting')
  context.progress({ label: 'Connecting', transferred: 1024, total: 4096 })
  await new Promise<void>((_resolve, reject) => {
    context.signal.addEventListener('abort', () => reject(new SiteRunCancelledError()), {
      once: true
    })
  })
}

const SITE: Site = {
  id: 'site-1',
  path: '/sites/acme',
  repoId: null,
  displayName: 'Acme',
  localWpRoot: '',
  localDomain: 'acme.local',
  localStack: 'plain',
  dbUser: 'root',
  dbSocket: '',
  dbPort: null,
  phpVersion: '8.2',
  activeEnvironment: 'main',
  environments: {},
  notes: '',
  searchReplaceTimeoutSeconds: 600
}

type Sender = {
  isDestroyed: () => boolean
  send: (channel: string, event: SiteRunEvent) => void
}

let events: SiteRunEvent[] = []
let terminal = Promise.withResolvers<SiteRunEvent>()
let destroyed = false

function sender(): Sender {
  return {
    isDestroyed: () => destroyed,
    send: (_channel, event) => {
      events.push(event)
      if (event.type === 'status') {
        terminal.resolve(event)
      }
    }
  }
}

function store(site: Site | null = SITE): Store {
  return { getSite: () => site } as unknown as Store
}

async function invoke<T>(channel: string, args?: unknown): Promise<T> {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`No handler registered for ${channel}`)
  }
  return (await handler({ sender: sender() }, args)) as T
}

type StartResult = { ok: true; value: { id: string } } | { ok: false; error: string }

beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'muster-site-runs-ipc-'))
  handlers.clear()
  events = []
  terminal = Promise.withResolvers<SiteRunEvent>()
  destroyed = false
  buildSiteSummaryMock.mockResolvedValue({
    site: SITE,
    pathExists: true,
    branch: 'main',
    resolvedEnvironment: {
      environment: 'main',
      reason: 'branch-match',
      requiresConfirmation: false
    },
    secrets: {},
    importSelectedCount: 2,
    deploySelectedCount: 0
  } satisfies SiteSummary)
})

afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('registerSiteRunHandlers', () => {
  it('registers every channel', () => {
    registerSiteRunHandlers(store())
    expect([...handlers.keys()].sort()).toEqual([
      'siteRuns:active',
      'siteRuns:cancel',
      'siteRuns:list',
      'siteRuns:readLog',
      'siteRuns:start'
    ])
  })

  it('returns a tagged failure instead of throwing for a malformed payload', async () => {
    registerSiteRunHandlers(store())
    expect(await invoke('siteRuns:start', { siteId: 'site-1' })).toEqual({
      ok: false,
      error: 'Invalid run request.'
    })
    expect(await invoke('siteRuns:cancel', 42)).toEqual({ ok: false, error: 'Invalid run id.' })
    expect(await invoke('siteRuns:list', {})).toEqual({ ok: false, error: 'Invalid site id.' })
    expect(await invoke('siteRuns:readLog', { siteId: 'site-1' })).toEqual({
      ok: false,
      error: 'Invalid log request.'
    })
  })

  it('returns a tagged failure for an unknown site', async () => {
    registerSiteRunHandlers(store(null))
    const result = await invoke<StartResult>('siteRuns:start', {
      siteId: 'ghost',
      group: 'import'
    })
    expect(result).toEqual({ ok: false, error: 'Unknown site: ghost' })
  })

  it('refuses to start when no environment resolves', async () => {
    buildSiteSummaryMock.mockResolvedValue({
      site: SITE,
      pathExists: true,
      branch: null,
      resolvedEnvironment: {
        environment: null,
        reason: 'no-environments',
        requiresConfirmation: true
      },
      secrets: {},
      importSelectedCount: 0,
      deploySelectedCount: 0
    } satisfies SiteSummary)
    registerSiteRunHandlers(store())
    const result = await invoke<StartResult>('siteRuns:start', {
      siteId: 'site-1',
      group: 'import'
    })
    expect(result).toEqual({ ok: false, error: 'Site has no environment to target: Acme' })
  })
})

// Phase 2's exit criterion, end to end over the IPC seam: a staged job streams, a remounted
// panel can re-read its state from main, and a cancel settles it with no work left running.
describe('staged run over IPC', () => {
  it('streams stages, survives a remount, and cancels cleanly', async () => {
    registerSiteRunHandlers(store(), scriptedJob)
    const started = await invoke<StartResult>('siteRuns:start', {
      siteId: 'site-1',
      group: 'import',
      runId: 'run-under-test'
    })
    expect(started).toMatchObject({ ok: true, value: { id: 'run-under-test' } })

    // The first stage is announced synchronously by the job, before any await.
    await Promise.resolve()
    expect(events.some((event) => event.type === 'log' && event.line.level === 'status')).toBe(true)

    // A remounted panel asks main for the truth rather than replaying events it missed.
    const active = await invoke<{
      ok: true
      value: { run: { id: string; status: string }; progress: { stage: string } | null }[]
    }>('siteRuns:active')
    expect(active.value).toHaveLength(1)
    expect(active.value[0].run.status).toBe('running')
    expect(active.value[0].progress?.stage).toBe('Connecting')

    expect(await invoke('siteRuns:cancel', 'run-under-test')).toEqual({ ok: true, value: true })
    expect(await terminal.promise).toEqual({
      type: 'status',
      runId: 'run-under-test',
      status: 'cancelled'
    })

    // The terminal event fires while the run is still registered — deregistration is the
    // outermost finally — so a subscriber reacting to it can still read the run from main.
    const stillRegistered = await invoke<{ ok: true; value: unknown[] }>('siteRuns:active')
    expect(stillRegistered.value).toHaveLength(1)
    await vi.waitFor(async () => {
      const afterwards = await invoke<{ ok: true; value: unknown[] }>('siteRuns:active')
      expect(afterwards.value).toEqual([])
    })
  })

  it('persists the cancelled run so it is still listable and readable', async () => {
    registerSiteRunHandlers(store(), scriptedJob)
    await invoke('siteRuns:start', { siteId: 'site-1', group: 'import', runId: 'persisted' })
    await Promise.resolve()
    await invoke('siteRuns:cancel', 'persisted')
    await terminal.promise

    const listed = await invoke<{
      ok: true
      value: { id: string; status: string; environment: string }[]
    }>('siteRuns:list', { siteId: 'site-1' })
    expect(listed.value).toMatchObject([
      { id: 'persisted', status: 'cancelled', environment: 'main' }
    ])

    const page = await invoke<{
      ok: true
      value: { lines: { level: string; text: string }[] }
    }>('siteRuns:readLog', { siteId: 'site-1', runId: 'persisted' })
    expect(page.value.lines[0]).toMatchObject({ level: 'status', text: 'Connecting' })
  })

  it('stops sending to a destroyed renderer', async () => {
    registerSiteRunHandlers(store(), scriptedJob)
    await invoke('siteRuns:start', { siteId: 'site-1', group: 'import', runId: 'gone' })
    await Promise.resolve()
    const beforeDestroy = events.length
    destroyed = true
    // The cancel still settles the run; the events simply go nowhere.
    expect(await invoke('siteRuns:cancel', 'gone')).toEqual({ ok: true, value: true })
    // Wait on the run actually settling, not on a duration: the point is that it settled
    // without a single send reaching the dead renderer.
    await vi.waitFor(async () => {
      const active = await invoke<{ ok: true; value: unknown[] }>('siteRuns:active')
      expect(active.value).toEqual([])
    })
    expect(events.length).toBe(beforeDestroy)
  })

  // Phase 10 tools start runs on the shared registry instead of through siteRuns:start.
  it('exposes the shared service and streams to a renderer that subscribed directly', async () => {
    registerSiteRunHandlers(store(), scriptedJob)
    const runs = getSiteRunService()
    expect(runs).not.toBeNull()

    // A renderer that has never called a siteRuns channel receives nothing until it subscribes.
    subscribeSiteRunEvents(sender() as unknown as WebContents)
    const run = runs?.start({
      runId: 'tool-run',
      siteId: 'site-1',
      siteName: 'Acme',
      group: 'import',
      environment: 'main',
      branch: 'main',
      job: async (context) => context.log('tool step')
    })
    expect(run?.id).toBe('tool-run')
    await runs?.waitFor('tool-run')
    expect(events.some((event) => event.type === 'log' && event.line.text === 'tool step')).toBe(
      true
    )
  })
})
