import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySiteEnvironment, type Site, type SiteResult } from '../../shared/site-types'
import type { Store } from '../persistence'
import type * as LocalWpMigrationModuleNamespace from '../sites/localwp-migration'

type LocalWpMigrationModule = typeof LocalWpMigrationModuleNamespace

const { handlers, removed } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, args?: unknown) => unknown>(),
  removed: [] as string[]
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      removed.push(channel)
    })
  }
}))

// Spy, not stub: the preview test below still exercises the real planner, which is pure enough to
// answer without a Local app. Anything that MUTATES is driven through the spy — a test that reaches
// the real Local app registers a real site on the developer's machine.
vi.mock('../sites/localwp-migration', async (importActual) => {
  const actual = await importActual<LocalWpMigrationModule>()
  return { ...actual, runLocalWpMigration: vi.fn(actual.runLocalWpMigration) }
})

// safeStorage needs a live Electron app, and a real write would touch the developer's keychain.
vi.mock('../sites/site-secret-store', () => ({ setSiteSecret: vi.fn() }))

import type { WebContents } from 'electron'
import { runLocalWpMigration } from '../sites/localwp-migration'
import { setSiteSecret } from '../sites/site-secret-store'
import { registerSiteStackHandlers } from './site-stacks'

const SITE_ID = 'site-1'

function site(overrides: Partial<Site> = {}): Site {
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
    environments: { main: createEmptySiteEnvironment() },
    notes: '',
    searchReplaceTimeoutSeconds: 600,
    ...overrides
  }
}

type StoreStub = { store: Store; updates: Partial<Site>[] }

function storeStub(record: Site | null = site()): StoreStub {
  const updates: Partial<Site>[] = []
  const store = {
    getSite: (id: string) => (record && id === record.id ? record : null),
    updateSite: (_id: string, patch: Partial<Site>) => {
      updates.push(patch)
      return record
    }
  } as unknown as Store
  return { store, updates }
}

/** The real handler reads `event.sender`; a bare `{}` would only fail once a status line arrives. */
function senderStub(destroyed = false): { sender: WebContents; sent: unknown[] } {
  const sent: unknown[] = []
  const sender = {
    isDestroyed: () => destroyed,
    send: (_channel: string, payload: unknown) => {
      sent.push(payload)
    }
  } as unknown as WebContents
  return { sender, sent }
}

async function call<T>(
  channel: string,
  args?: unknown,
  sender: WebContents = senderStub().sender
): Promise<SiteResult<T>> {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`No handler registered for ${channel}`)
  }
  return (await handler({ sender }, args)) as SiteResult<T>
}

beforeEach(() => {
  handlers.clear()
  removed.length = 0
  vi.mocked(setSiteSecret).mockClear()
})

describe('registerSiteStackHandlers', () => {
  it('removes every channel before registering it, so a re-register cannot double-bind', () => {
    const { store } = storeStub()
    registerSiteStackHandlers(store)
    expect([...handlers.keys()].sort()).toEqual([
      'siteStacks:detect',
      'siteStacks:previewMigration',
      'siteStacks:resolveSocket',
      'siteStacks:runMigration',
      'siteStacks:start',
      'siteStacks:stop'
    ])
    expect(removed.sort()).toEqual([...handlers.keys()].sort())
  })
})

describe('tagged-union contract', () => {
  beforeEach(() => {
    registerSiteStackHandlers(storeStub().store)
  })

  it('returns a failure result rather than throwing for an unknown site', async () => {
    for (const channel of [
      'siteStacks:detect',
      'siteStacks:resolveSocket',
      'siteStacks:start',
      'siteStacks:stop'
    ]) {
      const result = await call(channel, 'no-such-site')
      expect(result).toEqual({ ok: false, error: 'Unknown site: no-such-site' })
    }
  })

  it('rejects a non-string siteId without throwing', async () => {
    for (const value of [undefined, null, 42, {}, 'x'.repeat(300)]) {
      const result = await call('siteStacks:detect', value)
      expect(result.ok).toBe(false)
    }
  })

  it('rejects a migration payload that is not an object', async () => {
    const result = await call('siteStacks:previewMigration', 'not-an-object')
    expect(result).toEqual({ ok: false, error: 'Expected an arguments object' })
  })

  it('requires a domain, an admin email, and an admin password for a migration', async () => {
    const base = { siteId: SITE_ID, domain: 'acme.local', adminEmail: 'a@b.c', adminPassword: 'x' }
    for (const missing of ['domain', 'adminEmail', 'adminPassword'] as const) {
      const result = await call('siteStacks:previewMigration', { ...base, [missing]: '   ' })
      expect(result).toEqual({ ok: false, error: `${missing} must be a non-empty string` })
    }
  })
})

// These three reach the real host on purpose: they are read-only, and the point is that the handlers
// answer with a structured value on a machine where nothing is set up. `siteStacks:start` is the one
// that could mutate — it shells out to `local-cli start-site` — so it asserts the not-managed bail
// rather than only its socket, and fails loudly if the fixture path ever becomes a real Local site.
describe('detection results', () => {
  it('reports a structured answer for a real site path', async () => {
    registerSiteStackHandlers(storeStub().store)
    const detect = await call<{ supported: boolean; stack: string }>('siteStacks:detect', SITE_ID)
    expect(detect.ok).toBe(true)
    if (detect.ok) {
      expect(typeof detect.value.supported).toBe('boolean')
      expect(['plain', 'mamp', 'localwp']).toContain(detect.value.stack)
    }
  })

  it('resolves an empty socket for a checkout Local does not manage', async () => {
    registerSiteStackHandlers(storeStub().store)
    const result = await call<string>('siteStacks:resolveSocket', SITE_ID)
    expect(result).toEqual({ ok: true, value: '' })
  })

  it('does not persist a socket when nothing resolved', async () => {
    const { store, updates } = storeStub()
    registerSiteStackHandlers(store)
    const result = await call<{ ok: boolean; socketPath: string; state: string }>(
      'siteStacks:start',
      SITE_ID
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.socketPath).toBe('')
      expect(result.value.state).toBe('not-managed')
    }
    expect(updates).toEqual([])
  })

  it('previews a create, not a refusal, for a checkout with no WordPress install', async () => {
    registerSiteStackHandlers(storeStub().store)
    const result = await call<{ mode: string; moves: unknown[]; edits: unknown[] }>(
      'siteStacks:previewMigration',
      { siteId: SITE_ID, domain: 'acme.local', adminEmail: 'a@b.c', adminPassword: 'x' }
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      // No wp-config.php at the root is ocsites' setup_localwp_before_clone case, not a block. The
      // mode is decided before any precondition, so this holds whatever Local is doing.
      expect(result.value.mode).toBe('create')
      // The path does not exist, so there is nothing to relocate and nothing to rewrite.
      expect(result.value.moves).toEqual([])
      expect(result.value.edits).toEqual([])
    }
  })

  it('does not update the site record when the setup is blocked', async () => {
    const { store, updates } = storeStub()
    registerSiteStackHandlers(store)
    // Driven through the spy: letting this reach the real migration would ask a running Local app
    // to register /Sites/acme for real.
    vi.mocked(runLocalWpMigration).mockResolvedValueOnce({
      ok: false,
      message: 'The Local app is not running. Open Local and try again.',
      plan: {
        ok: false,
        blockedReason: 'The Local app is not running. Open Local and try again.',
        mode: 'create',
        sitePath: '/Sites/acme',
        domain: 'acme.local',
        wordPressRoot: '/Sites/acme/app/public',
        databaseName: '',
        databaseUser: '',
        appPublicEntries: [],
        moves: [],
        edits: [],
        steps: []
      },
      socketPath: '',
      localWpRoot: '',
      databaseImported: false,
      log: []
    })
    const result = await call<{ ok: boolean }>('siteStacks:runMigration', {
      siteId: SITE_ID,
      domain: 'acme.local',
      adminEmail: 'a@b.c',
      adminPassword: 'x'
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.ok).toBe(false)
    }
    expect(updates).toEqual([])
  })
})

describe('migration progress streaming', () => {
  const MIGRATION_ARGS = {
    siteId: SITE_ID,
    domain: 'acme.local',
    adminEmail: 'a@b.c',
    adminPassword: 'hunter2'
  }

  /** Replays the status lines the real migration would emit, then reports the given outcome. */
  function respondWith(statuses: string[], ok: boolean): void {
    vi.mocked(runLocalWpMigration).mockImplementationOnce(async (_request, dependencies) => {
      for (const status of statuses) {
        dependencies.onStatus?.(status)
      }
      return {
        ok,
        message: ok ? 'Migration complete.' : 'Timed out waiting for the LocalWP MySQL socket.',
        plan: {
          ok,
          blockedReason: '',
          mode: 'migrate',
          sitePath: '/Sites/acme',
          domain: 'acme.local',
          wordPressRoot: '/Sites/acme/app/public',
          databaseName: 'acme',
          databaseUser: 'root',
          appPublicEntries: [],
          moves: [],
          edits: [],
          steps: []
        },
        socketPath: ok ? '/tmp/mysqld.sock' : '',
        localWpRoot: ok ? 'app/public' : '',
        databaseImported: ok,
        log: statuses
      }
    })
  }

  it('forwards every status line to the requesting window, in order and tagged', async () => {
    registerSiteStackHandlers(storeStub().store)
    const { sender, sent } = senderStub()
    respondWith(['Creating LocalWP site: acme.local…', 'Socket ready.'], true)
    await call('siteStacks:runMigration', MIGRATION_ARGS, sender)
    expect(sent).toEqual([
      { siteId: SITE_ID, message: 'Creating LocalWP site: acme.local…' },
      { siteId: SITE_ID, message: 'Socket ready.' }
    ])
  })

  it('never lets the admin password reach the renderer', async () => {
    registerSiteStackHandlers(storeStub().store)
    const { sender, sent } = senderStub()
    respondWith(['wp core install --admin_password=hunter2'], true)
    await call('siteStacks:runMigration', MIGRATION_ARGS, sender)
    expect(JSON.stringify(sent)).not.toContain('hunter2')
  })

  it('completes the migration even though the window closed mid-run', async () => {
    registerSiteStackHandlers(storeStub().store)
    const { sender, sent } = senderStub(true)
    respondWith(['Socket ready.'], true)
    const result = await call<{ ok: boolean }>('siteStacks:runMigration', MIGRATION_ARGS, sender)
    expect(sent).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('leaves the site record alone when the migration itself failed', async () => {
    const { store, updates } = storeStub()
    registerSiteStackHandlers(store)
    respondWith(['Waiting for LocalWP to complete setup…'], false)
    const result = await call<{ ok: boolean; message: string }>(
      'siteStacks:runMigration',
      MIGRATION_ARGS
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.ok).toBe(false)
      expect(result.value.message).toContain('Timed out')
    }
    expect(updates).toEqual([])
  })

  // Why: without this the next "Import from the server" fails with "Access denied for user
  // 'root'@'localhost' (using password: NO)" — the run config reads the db secret, and setup was
  // the only thing that knew Local's password.
  it('stores Local MySQL root password so a later import can authenticate', async () => {
    registerSiteStackHandlers(storeStub().store)
    respondWith(['Socket ready.'], true)
    await call('siteStacks:runMigration', MIGRATION_ARGS)
    expect(setSiteSecret).toHaveBeenCalledWith(SITE_ID, 'main', 'db', 'root')
  })

  it('stores the password for every environment, since a local socket is not per-environment', async () => {
    const record = site({
      environments: {
        main: createEmptySiteEnvironment(),
        staging: createEmptySiteEnvironment()
      }
    })
    registerSiteStackHandlers(storeStub(record).store)
    respondWith(['Socket ready.'], true)
    await call('siteStacks:runMigration', MIGRATION_ARGS)
    const environments = vi.mocked(setSiteSecret).mock.calls.map((entry) => entry[1])
    expect(environments).toEqual(['main', 'staging'])
  })

  it('does not store a database password when the setup failed', async () => {
    registerSiteStackHandlers(storeStub().store)
    respondWith(['Waiting for LocalWP to complete setup…'], false)
    await call('siteStacks:runMigration', MIGRATION_ARGS)
    expect(setSiteSecret).not.toHaveBeenCalled()
  })
})
