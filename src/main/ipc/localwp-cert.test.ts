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
      'localwpCert:cancelEnsure',
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
    // Third argument is the progress sink: the ensure wait can block on Local's password prompt for
    // minutes, so the wizard's HTTPS row has to be able to say so. Without a token there is no
    // signal in the options, and the request cannot be cancelled.
    expect(ensureLocalWpHttpsCert).toHaveBeenCalledWith('ebes.local', '/Sites/ebes', {
      onStatus: expect.any(Function)
    })
  })

  it('aborts the in-flight ensure when the renderer cancels its token', async () => {
    const pending = Promise.withResolvers<{ ok: boolean; message: string }>()
    ensureLocalWpHttpsCert.mockReturnValue(pending.promise)
    const event = { sender: { id: 7, isDestroyed: () => false, send: () => {} } }
    const cancelled = {
      ok: false,
      message: 'Cancelled while waiting for LocalWP to register the site.'
    }

    const call = handlers.get('localwpCert:ensure')?.(event, {
      domain: 'ebes.local',
      siteId: 'site-1',
      requestToken: 'token-1'
    })
    const signal = vi.mocked(ensureLocalWpHttpsCert).mock.calls.at(-1)?.[2]?.signal
    expect(signal?.aborted).toBe(false)

    handlers.get('localwpCert:cancelEnsure')?.(event, { requestToken: 'token-1' })
    expect(signal?.aborted).toBe(true)

    // The cancelled outcome the provider produced is what reaches the wizard, not a bridge error.
    pending.resolve(cancelled)
    await expect(call).resolves.toEqual({ ok: true, value: cancelled })
  })

  it("does not let one window's token cancel another window's ensure", async () => {
    const pending = Promise.withResolvers<{ ok: boolean; message: string }>()
    ensureLocalWpHttpsCert.mockReturnValue(pending.promise)
    const first = { sender: { id: 1, isDestroyed: () => false, send: () => {} } }
    const second = { sender: { id: 2, isDestroyed: () => false, send: () => {} } }

    const call = handlers.get('localwpCert:ensure')?.(first, {
      domain: 'ebes.local',
      siteId: 'site-1',
      requestToken: 'shared-token'
    })
    const signal = vi.mocked(ensureLocalWpHttpsCert).mock.calls.at(-1)?.[2]?.signal

    handlers.get('localwpCert:cancelEnsure')?.(second, { requestToken: 'shared-token' })
    expect(signal?.aborted).toBe(false)

    handlers.get('localwpCert:cancelEnsure')?.(first, { requestToken: 'shared-token' })
    expect(signal?.aborted).toBe(true)

    pending.resolve({ ok: true, message: 'trusted' })
    await call
  })

  it('streams the wait over the migration progress channel, scoped to the site', async () => {
    const sent: { siteId: string; message: string }[] = []
    registerLocalWpCertHandlers({
      getSite: () => ({
        id: 'site-1',
        path: '/Sites/ebes',
        localStack: 'localwp',
        localWpRoot: ''
      })
    } as never)
    const handler = handlers.get('localwpCert:ensure')
    expect(handler).toBeDefined()
    await handler?.(
      {
        sender: {
          isDestroyed: () => false,
          send: (_channel: string, event: never) => sent.push(event)
        }
      },
      { domain: 'ebes.local', siteId: 'site-1' }
    )
    const options = vi.mocked(ensureLocalWpHttpsCert).mock.calls.at(-1)?.[2]
    options?.onStatus?.('Waiting for LocalWP to finish setting up ebes.local…')

    expect(sent).toEqual([
      { siteId: 'site-1', message: 'Waiting for LocalWP to finish setting up ebes.local…' }
    ])
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
