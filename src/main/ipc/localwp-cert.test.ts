import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalWpCertStatus, LocalWpCertTrustResult } from '../../shared/localwp-cert-types'
import type { SiteResult } from '../../shared/site-types'

const { handlers, removed, getLocalWpCertStatus, trustLocalWpCert, ensureLocalWpHttpsCert } =
  vi.hoisted(() => ({
    handlers: new Map<string, (event: unknown, args?: unknown) => unknown>(),
    removed: [] as string[],
    getLocalWpCertStatus: vi.fn(),
    trustLocalWpCert: vi.fn(),
    ensureLocalWpHttpsCert: vi.fn()
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

// The keychain logic has its own tests; what is under test here is the channel surface — names,
// domain validation, and the tagged-union wrapping.
vi.mock('../sites/localwp-cert-trust', () => ({ getLocalWpCertStatus, trustLocalWpCert }))
vi.mock('../sites/localwp-cert-ensure', () => ({ ensureLocalWpHttpsCert }))

import { registerLocalWpCertHandlers } from './localwp-cert'

const STATUS: LocalWpCertStatus = {
  supported: true,
  domain: '117pacific.local',
  certPath: '/certs/117pacific.local.crt',
  exists: true,
  trusted: false,
  reason: 'not trusted yet'
}

const TRUSTED: LocalWpCertTrustResult = { ok: true, message: 'trusted' }

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
  vi.clearAllMocks()
  getLocalWpCertStatus.mockResolvedValue(STATUS)
  trustLocalWpCert.mockResolvedValue(TRUSTED)
  ensureLocalWpHttpsCert.mockResolvedValue({ ok: true, message: 'ensured' })
  registerLocalWpCertHandlers({
    getSite: () => ({
      id: 'site-1',
      path: '/Sites/ebes',
      localStack: 'localwp',
      localWpRoot: ''
    })
  } as never)
})

describe('registerLocalWpCertHandlers', () => {
  it('removes every channel before registering it, so a re-register cannot double-bind', () => {
    expect([...handlers.keys()].sort()).toEqual([
      'localwpCert:ensure',
      'localwpCert:status',
      'localwpCert:trust'
    ])
    expect(removed.sort()).toEqual([...handlers.keys()].sort())
  })

  it('passes the trimmed domain through and wraps the status in a tagged result', async () => {
    expect(await call('localwpCert:status', { domain: '  117pacific.local  ' })).toEqual({
      ok: true,
      value: STATUS
    })
    expect(getLocalWpCertStatus).toHaveBeenCalledWith('117pacific.local')
  })

  it('starts the site then trusts when asked to ensure a missing certificate', async () => {
    expect(await call('localwpCert:ensure', { domain: 'ebes.local', siteId: 'site-1' })).toEqual({
      ok: true,
      value: { ok: true, message: 'ensured' }
    })
    expect(ensureLocalWpHttpsCert).toHaveBeenCalledWith('ebes.local', '/Sites/ebes')
  })

  it('wraps the trust outcome the same way', async () => {
    expect(await call('localwpCert:trust', { domain: '117pacific.local' })).toEqual({
      ok: true,
      value: TRUSTED
    })
    expect(trustLocalWpCert).toHaveBeenCalledWith('117pacific.local')
  })

  it('rejects a traversal attempt on both channels before it reaches a filesystem path', async () => {
    const hostile = ['../../etc/passwd', 'acme/../../..', '..', 'acme/local', 'acme\\local', '.ssh']

    for (const domain of hostile) {
      expect(await call('localwpCert:status', { domain })).toEqual({
        ok: false,
        error: expect.stringContaining('hostname')
      })
      expect(await call('localwpCert:trust', { domain })).toEqual({
        ok: false,
        error: expect.stringContaining('hostname')
      })
    }
    expect(getLocalWpCertStatus).not.toHaveBeenCalled()
    expect(trustLocalWpCert).not.toHaveBeenCalled()
  })

  it('returns a failure rather than throwing for a missing, empty or oversized domain', async () => {
    expect(await call('localwpCert:status', {})).toEqual({
      ok: false,
      error: 'domain must be a string'
    })
    expect((await call('localwpCert:status', { domain: '   ' })).ok).toBe(false)
    expect((await call('localwpCert:trust', { domain: 'a'.repeat(254) })).ok).toBe(false)
    expect(getLocalWpCertStatus).not.toHaveBeenCalled()
    expect(trustLocalWpCert).not.toHaveBeenCalled()
  })

  it('surfaces a rejection as a tagged failure, never across the bridge', async () => {
    trustLocalWpCert.mockRejectedValue(new Error('security exploded'))
    expect(await call('localwpCert:trust', { domain: '117pacific.local' })).toEqual({
      ok: false,
      error: 'security exploded'
    })
  })
})
