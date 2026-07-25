import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySiteEnvironment, type Site, type SiteResult } from '../../shared/site-types'
import type { Store } from '../persistence'

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

async function call<T>(channel: string, args?: unknown): Promise<SiteResult<T>> {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`No handler registered for ${channel}`)
  }
  return (await handler({}, args)) as SiteResult<T>
}

beforeEach(() => {
  handlers.clear()
  removed.length = 0
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
    const result = await call<{ ok: boolean; socketPath: string }>('siteStacks:start', SITE_ID)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.socketPath).toBe('')
    }
    expect(updates).toEqual([])
  })

  it('blocks a migration for a checkout with no WordPress install', async () => {
    registerSiteStackHandlers(storeStub().store)
    const result = await call<{ ok: boolean; blockedReason: string; moves: unknown[] }>(
      'siteStacks:previewMigration',
      { siteId: SITE_ID, domain: 'acme.local', adminEmail: 'a@b.c', adminPassword: 'x' }
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.ok).toBe(false)
      expect(result.value.blockedReason.length).toBeGreaterThan(0)
      expect(result.value.moves).toEqual([])
    }
  })

  it('does not update the site record when the migration is blocked', async () => {
    const { store, updates } = storeStub()
    registerSiteStackHandlers(store)
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
