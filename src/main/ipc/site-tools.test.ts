import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteRun } from '../../shared/site-run-types'
import {
  createEmptySiteEnvironment,
  type Site,
  type SiteResult,
  type SiteSummary
} from '../../shared/site-types'
import type { Store } from '../persistence'
import type { RemoteLayout, SiteRunContext } from '../sites/pipeline-contract'

const { handlers, removed } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, args?: unknown) => unknown>(),
  removed: [] as string[]
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/muster-userdata' },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      removed.push(channel)
    })
  }
}))

const { startMock, subscribeMock, serviceAvailable } = vi.hoisted(() => ({
  startMock: vi.fn(),
  subscribeMock: vi.fn(),
  serviceAvailable: { value: true }
}))

vi.mock('./site-runs', () => ({
  getSiteRunService: () => (serviceAvailable.value ? { start: startMock } : null),
  subscribeSiteRunEvents: subscribeMock
}))

// Every value a vi.mock factory closes over has to be hoisted with it, or the factory runs before
// the binding exists.
const { LAYOUT, FAKE_SESSION, summaryState, syncUploadsMock, syncPluginMock, fetchPathsMock } =
  vi.hoisted(() => ({
    LAYOUT: { webroot: 'public_html', contentDir: 'wp-content' } as RemoteLayout,
    FAKE_SESSION: { exec: vi.fn() },
    summaryState: { value: null as SiteSummary | null },
    syncUploadsMock: vi.fn(),
    syncPluginMock: vi.fn(),
    fetchPathsMock: vi.fn()
  }))

vi.mock('../sites/site-tool-session', () => ({
  withRemoteSiteTool: vi.fn(
    async (_config: unknown, _signal: unknown, run: (tool: unknown) => Promise<unknown>) =>
      run({ session: FAKE_SESSION, layout: LAYOUT })
  )
}))

vi.mock('../sites/site-summary', () => ({
  buildSiteSummary: async () => summaryState.value
}))

vi.mock('../sites/site-secret-store', () => ({
  getSiteSecret: () => 'secret',
  getSiteSecretPresence: () => ({ ssh: true, db: true })
}))

vi.mock('../sites/remote-uploads-sync', () => ({ syncUploadsFromRemote: syncUploadsMock }))
vi.mock('../sites/remote-plugin-sync', () => ({
  syncPluginFromRemote: syncPluginMock,
  comparePlugins: vi.fn()
}))
vi.mock('../sites/remote-path-fetch', () => ({ fetchRemotePaths: fetchPathsMock }))

import { registerSiteToolHandlers, SITE_DOWNLOADS_DIR_NAME } from './site-tools'

const SITE_ID = 'site-1'

function site(environments: Record<string, ReturnType<typeof createEmptySiteEnvironment>>): Site {
  return {
    id: SITE_ID,
    path: '/Sites/acme',
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '',
    activeEnvironment: 'main',
    environments,
    notes: '',
    searchReplaceTimeoutSeconds: 600
  }
}

type Fixture = {
  store: Store
  branch: string | null
  hasSshSecret?: boolean
  environments?: string[]
  pathExists?: boolean
}

function fixture(options: Partial<Fixture> = {}): Store {
  const names = options.environments ?? ['main']
  const environments = Object.fromEntries(
    names.map((name) => [
      name,
      { ...createEmptySiteEnvironment(), hostname: 'srv.test', username: 'deploy' }
    ])
  )
  const record = site(environments)
  const branch = options.branch === undefined ? 'main' : options.branch
  summaryState.value = {
    site: record,
    pathExists: options.pathExists ?? true,
    branch,
    resolvedEnvironment:
      branch && names.includes(branch)
        ? { environment: branch, reason: 'branch-match', requiresConfirmation: false }
        : { environment: names[0], reason: 'first-environment', requiresConfirmation: true },
    secrets: Object.fromEntries(
      names.map((name) => [name, { ssh: options.hasSshSecret ?? true, db: true }])
    ),
    importSelectedCount: 0,
    deploySelectedCount: 0
  }
  return { getSite: (id: string) => (id === SITE_ID ? record : null) } as unknown as Store
}

async function call<T>(channel: string, args?: unknown): Promise<SiteResult<T>> {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`No handler registered for ${channel}`)
  }
  return (await handler({ sender: { id: 7 } }, args)) as SiteResult<T>
}

const STARTED_RUN: SiteRun = {
  id: 'run-1',
  siteId: SITE_ID,
  siteName: 'Acme',
  group: 'import',
  environment: 'main',
  branch: 'main',
  status: 'running',
  startedAt: 1,
  endedAt: null,
  error: null,
  logPath: '/logs/run-1'
}

function noopContext(): SiteRunContext {
  return {
    signal: new AbortController().signal,
    log: vi.fn(),
    status: vi.fn(),
    progress: vi.fn(),
    throwIfCancelled: vi.fn()
  }
}

beforeEach(() => {
  handlers.clear()
  removed.length = 0
  startMock.mockReset()
  startMock.mockReturnValue(STARTED_RUN)
  subscribeMock.mockReset()
  syncUploadsMock.mockReset()
  syncUploadsMock.mockResolvedValue({
    target: '/x',
    backupPath: null,
    zipSizeBytes: 1,
    subdir: null
  })
  syncPluginMock.mockReset()
  syncPluginMock.mockResolvedValue({ plugin: 'acf' })
  fetchPathsMock.mockReset()
  fetchPathsMock.mockResolvedValue({ localZipPath: '/x.zip', extractedTo: null, missing: [] })
  serviceAvailable.value = true
})

describe('registerSiteToolHandlers', () => {
  it('removes every channel before registering it, so a re-register cannot double-bind', () => {
    registerSiteToolHandlers(fixture())
    expect([...handlers.keys()].sort()).toEqual([
      'siteTools:activeTheme',
      'siteTools:checkHealth',
      'siteTools:comparePlugins',
      'siteTools:fetchPaths',
      'siteTools:findFile',
      'siteTools:runWpCli',
      'siteTools:syncPlugin',
      'siteTools:syncUploads',
      'siteTools:syncUploadsSubdir',
      'siteTools:testConnection',
      'siteTools:wordpressVersion'
    ])
    expect(removed.sort()).toEqual([...handlers.keys()].sort())
  })
})

describe('siteTools sync channels', () => {
  it('starts a run on the shared service and subscribes the calling renderer', async () => {
    registerSiteToolHandlers(fixture())
    const result = await call<SiteRun>('siteTools:syncUploads', { siteId: SITE_ID })

    expect(result).toEqual({ ok: true, value: STARTED_RUN })
    // Without the subscribe the run would stream to nobody: this renderer never touched siteRuns.
    expect(subscribeMock).toHaveBeenCalledWith({ id: 7 })
    expect(startMock.mock.calls[0][0]).toMatchObject({
      siteId: SITE_ID,
      group: 'import',
      environment: 'main',
      branch: 'main'
    })
  })

  it('runs the sync against the resolved session and the per-site download directory', async () => {
    registerSiteToolHandlers(fixture())
    await call('siteTools:syncUploads', { siteId: SITE_ID, maxZipSizeMb: 64, backup: false })

    const context = noopContext()
    await startMock.mock.calls[0][0].job(context)
    const [, , session, layout, request] = syncUploadsMock.mock.calls[0]
    expect(session).toBe(FAKE_SESSION)
    expect(layout).toBe(LAYOUT)
    expect(request).toEqual({
      downloadDir: `/tmp/muster-userdata/${SITE_DOWNLOADS_DIR_NAME}/${SITE_ID}`,
      maxZipSizeMb: 64,
      backup: false
    })
  })

  it('defaults to keeping a backup, because replacing a tree is otherwise unrecoverable', async () => {
    registerSiteToolHandlers(fixture())
    await call('siteTools:syncUploads', { siteId: SITE_ID })
    await startMock.mock.calls[0][0].job(noopContext())
    expect(syncUploadsMock.mock.calls[0][4].backup).toBe(true)
  })

  it('forwards the subdirectory and requires one on the subdir channel', async () => {
    registerSiteToolHandlers(fixture())
    const missing = await call('siteTools:syncUploadsSubdir', { siteId: SITE_ID })
    expect(missing.ok).toBe(false)
    expect(startMock).not.toHaveBeenCalled()

    await call('siteTools:syncUploadsSubdir', { siteId: SITE_ID, subdir: '2026/05' })
    await startMock.mock.calls[0][0].job(noopContext())
    expect(syncUploadsMock.mock.calls[0][4].subdir).toBe('2026/05')
  })

  it('passes the plugin slug and cleanup default through to the plugin sync', async () => {
    registerSiteToolHandlers(fixture())
    await call('siteTools:syncPlugin', { siteId: SITE_ID, plugin: 'acf' })
    await startMock.mock.calls[0][0].job(noopContext())
    expect(syncPluginMock.mock.calls[0][4]).toMatchObject({
      plugin: 'acf',
      cleanupDownload: true,
      backup: true
    })
  })

  it('logs what a path fetch produced', async () => {
    fetchPathsMock.mockResolvedValue({
      localZipPath: '/dl/1-fetch.zip',
      extractedTo: '/dl/1-fetch',
      missing: ['wp-content/nope']
    })
    registerSiteToolHandlers(fixture())
    await call('siteTools:fetchPaths', { siteId: SITE_ID, paths: ['wp-content/uploads'] })
    const context = noopContext()
    await startMock.mock.calls[0][0].job(context)
    expect(vi.mocked(context.log).mock.calls.flat()).toEqual([
      'Downloaded /dl/1-fetch.zip',
      'Extracted to /dl/1-fetch',
      'Not on the server: wp-content/nope'
    ])
  })
})

describe('siteTools guard', () => {
  it('refuses a sync when the branch matches no environment and nothing was confirmed', async () => {
    registerSiteToolHandlers(fixture({ branch: 'feature/x', environments: ['production'] }))
    const result = await call('siteTools:syncUploads', { siteId: SITE_ID })
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.error).toContain('does not match an environment')
    expect(startMock).not.toHaveBeenCalled()
  })

  it('allows the same sync once it is explicitly confirmed', async () => {
    registerSiteToolHandlers(fixture({ branch: 'feature/x', environments: ['production'] }))
    const result = await call('siteTools:syncUploads', { siteId: SITE_ID, confirm: true })
    expect(result.ok).toBe(true)
    expect(startMock).toHaveBeenCalledTimes(1)
  })

  it('allows the sync without a confirm when the environment is named explicitly', async () => {
    registerSiteToolHandlers(fixture({ branch: 'feature/x', environments: ['production'] }))
    const result = await call<SiteRun>('siteTools:syncUploads', {
      siteId: SITE_ID,
      environment: 'production'
    })
    expect(result.ok).toBe(true)
    expect(startMock.mock.calls[0][0].environment).toBe('production')
  })

  it('refuses a remote sync with no stored SSH password, even when confirmed', async () => {
    registerSiteToolHandlers(fixture({ hasSshSecret: false }))
    const result = await call('siteTools:syncUploads', { siteId: SITE_ID, confirm: true })
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.error).toContain('no SSH password')
    expect(startMock).not.toHaveBeenCalled()
  })

  it('refuses when the local checkout is missing', async () => {
    registerSiteToolHandlers(fixture({ pathExists: false }))
    const result = await call('siteTools:syncUploads', { siteId: SITE_ID, confirm: true })
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.error).toContain('not on disk')
  })

  it('refuses a WP-CLI write against an unmatched branch but permits the read', async () => {
    registerSiteToolHandlers(fixture({ branch: 'feature/x', environments: ['production'] }))
    const blocked = await call('siteTools:runWpCli', {
      siteId: SITE_ID,
      location: 'local',
      args: ['db', 'drop'],
      allowWrites: true
    })
    expect(blocked.ok).toBe(false)
    expect(blocked.ok ? '' : blocked.error).toContain('does not match an environment')
  })
})

describe('siteTools failure handling', () => {
  it('returns a tagged failure instead of throwing for an unknown site', async () => {
    registerSiteToolHandlers(fixture())
    expect(await call('siteTools:syncUploads', { siteId: 'ghost' })).toEqual({
      ok: false,
      error: 'Unknown site: ghost'
    })
  })

  it.each([[undefined], [null], ['nope'], [{}], [{ siteId: 42 }]])(
    'returns a tagged failure for the malformed payload %j',
    async (payload) => {
      registerSiteToolHandlers(fixture())
      const result = await call('siteTools:syncUploads', payload)
      expect(result.ok).toBe(false)
    }
  )

  it('reports an unknown environment rather than silently retargeting', async () => {
    registerSiteToolHandlers(fixture())
    const result = await call('siteTools:syncUploads', { siteId: SITE_ID, environment: 'ghost' })
    expect(result).toEqual({ ok: false, error: 'Unknown environment: ghost' })
  })

  it('reports a missing run service instead of losing the request', async () => {
    serviceAvailable.value = false
    registerSiteToolHandlers(fixture())
    const result = await call('siteTools:syncUploads', { siteId: SITE_ID })
    expect(result).toEqual({ ok: false, error: 'The site run service is not available yet.' })
  })
})
