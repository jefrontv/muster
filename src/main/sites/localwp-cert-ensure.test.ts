import { describe, expect, it, vi } from 'vitest'
import { localWpCertPath } from './localwp-cert-trust'
import { ensureLocalWpHttpsCert } from './localwp-cert-ensure'

const DOMAIN = 'ebes.local'
const SITE = '/Users/jake/Sites/ebes'
const CERT = localWpCertPath(DOMAIN)

describe('ensureLocalWpHttpsCert', () => {
  it('trusts immediately when LocalWP already wrote the certificate', async () => {
    const trust = vi.fn().mockResolvedValue({ ok: true, message: 'trusted' })
    const ensureRunning = vi.fn()
    const pokeHttps = vi.fn()

    const result = await ensureLocalWpHttpsCert(DOMAIN, SITE, {
      deps: {
        certExists: (filePath) => filePath === CERT,
        ensureRunning,
        pokeHttps,
        waitForCert: vi.fn(),
        trust
      }
    })

    expect(result.ok).toBe(true)
    expect(ensureRunning).not.toHaveBeenCalled()
    expect(pokeHttps).not.toHaveBeenCalled()
    expect(trust).toHaveBeenCalledWith(DOMAIN, expect.any(Object))
  })

  it('starts LocalWP, pokes HTTPS, waits, then trusts', async () => {
    const order: string[] = []
    const result = await ensureLocalWpHttpsCert(DOMAIN, SITE, {
      deps: {
        certExists: () => false,
        ensureRunning: async () => {
          order.push('start')
          return { ok: true, socketPath: '/tmp/mysql.sock', message: 'started', state: 'running' }
        },
        pokeHttps: async () => {
          order.push('poke')
        },
        waitForCert: async () => {
          order.push('wait')
          return true
        },
        trust: async () => {
          order.push('trust')
          return { ok: true, message: 'trusted' }
        }
      }
    })

    expect(result.ok).toBe(true)
    expect(order).toEqual(['start', 'poke', 'wait', 'trust'])
  })

  it('stops if LocalWP cannot start the site', async () => {
    const trust = vi.fn()
    const result = await ensureLocalWpHttpsCert(DOMAIN, SITE, {
      deps: {
        certExists: () => false,
        ensureRunning: async () => ({
          ok: false,
          socketPath: '',
          message: 'Not registered in the Local app',
          state: 'not-managed'
        }),
        pokeHttps: vi.fn(),
        waitForCert: vi.fn(),
        trust
      }
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('Not registered')
    expect(trust).not.toHaveBeenCalled()
  })

  it('fails honestly when the certificate never appears', async () => {
    const result = await ensureLocalWpHttpsCert(DOMAIN, SITE, {
      deps: {
        certExists: () => false,
        ensureRunning: async () => ({
          ok: true,
          socketPath: '/tmp/mysql.sock',
          message: 'started',
          state: 'running'
        }),
        pokeHttps: async () => undefined,
        waitForCert: async () => false,
        trust: vi.fn()
      }
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('still has no certificate')
  })
})
