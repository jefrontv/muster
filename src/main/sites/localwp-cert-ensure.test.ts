import { describe, expect, it, vi } from 'vitest'
import { localWpCertPath } from './localwp-cert-trust'
import { ensureLocalWpHttpsCert } from './localwp-cert-ensure'

const DOMAIN = 'ebes.local'
const SITE = '/Users/jake/Sites/ebes'
const CERT = localWpCertPath(DOMAIN)

describe('ensureLocalWpHttpsCert', () => {
  it('trusts when LocalWP already wrote the certificate and owns the site', async () => {
    const trust = vi.fn().mockResolvedValue({ ok: true, message: 'trusted' })
    const ensureRunning = vi.fn(async () => ({
      ok: true,
      socketPath: '/tmp/mysql.sock',
      message: 'LocalWP site already running',
      state: 'running' as const
    }))
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
    // Ownership is asked even when the certificate is already there — that is what a retry was
    // skipping — but nothing pokes or waits for a file that exists.
    expect(ensureRunning).toHaveBeenCalledTimes(1)
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

  it("gives Local's router a prompt-sized wait, not the shared 20s default", async () => {
    // The certificate is minted by Local's router, which is the component blocked on Local's own
    // admin prompt. A 20s shared default is what produced "it didn't wait for me to put my
    // password": the wait has to outlast a human, so assert the budget the call site passes.
    let seenBudget = 0
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
        waitForCert: async (_domain, options) => {
          seenBudget = options?.timeoutMs ?? 0
          return false
        },
        trust: vi.fn()
      }
    })

    expect(seenBudget).toBe(300_000)
    expect(result.ok).toBe(false)
    // Running out is a real failure, and it names the prompt rather than blaming the site.
    expect(result.message).toContain('password prompt')
    expect(result.message).toContain('Change and retry')
  })

  it('carries the domain and the registry wait into the start call', async () => {
    let seenOptions: { domain?: string; registrationTimeoutMs?: number } | undefined
    await ensureLocalWpHttpsCert(DOMAIN, SITE, {
      deps: {
        certExists: () => false,
        ensureRunning: async (_sitePath, options) => {
          seenOptions = options
          return {
            ok: true,
            socketPath: '/tmp/mysql.sock',
            message: 'started',
            state: 'running'
          }
        },
        pokeHttps: async () => undefined,
        waitForCert: async () => true,
        trust: async () => ({ ok: true, message: 'trusted' })
      }
    })

    expect(seenOptions?.domain).toBe(DOMAIN)
    // This is the one caller that opts into the wait — everyone else keeps the default of none.
    expect(seenOptions?.registrationTimeoutMs).toBe(60_000)
  })

  it('does not trust a leftover certificate when Local does not own the folder', async () => {
    // The regression the user hit on a retry: the .crt is on disk from an earlier attempt, so the
    // old code skipped ownership entirely and went green. Ownership is now asked first, and a
    // failed check must never reach trust.
    const trust = vi.fn()
    const pokeHttps = vi.fn()
    const waitForCert = vi.fn()
    let sawOptions: { domain?: string } | undefined

    const result = await ensureLocalWpHttpsCert(DOMAIN, SITE, {
      deps: {
        certExists: () => true,
        ensureRunning: async (_sitePath, options) => {
          sawOptions = options
          return {
            ok: true,
            socketPath: '',
            message: 'LocalWP never reported ebes.local as one of its sites.',
            state: 'not-managed'
          }
        },
        pokeHttps,
        waitForCert,
        trust
      }
    })

    expect(result.ok).toBe(false)
    expect(trust).not.toHaveBeenCalled()
    expect(pokeHttps).not.toHaveBeenCalled()
    expect(waitForCert).not.toHaveBeenCalled()
    // The ownership check ran even though the certificate already existed.
    expect(sawOptions?.domain).toBe(DOMAIN)
    // And the message says the leftover file proves nothing.
    expect(result.message).toContain('LocalWP never reported')
    expect(result.message).toContain('left over from an earlier attempt')
    expect(result.message).toContain('nothing was trusted')
  })

  it('stays fast when the cert exists and Local owns the site', async () => {
    // The fast path must remain fast: no poke, no wait, one trust.
    const trust = vi.fn().mockResolvedValue({ ok: true, message: 'trusted' })
    const pokeHttps = vi.fn()
    const waitForCert = vi.fn()
    const ensureRunning = vi.fn(async () => ({
      ok: true,
      socketPath: '/tmp/mysql.sock',
      message: 'LocalWP site already running',
      state: 'running' as const
    }))

    const result = await ensureLocalWpHttpsCert(DOMAIN, SITE, {
      deps: {
        certExists: () => true,
        ensureRunning,
        pokeHttps,
        waitForCert,
        trust
      }
    })

    expect(result.ok).toBe(true)
    expect(ensureRunning).toHaveBeenCalledTimes(1)
    expect(pokeHttps).not.toHaveBeenCalled()
    expect(waitForCert).not.toHaveBeenCalled()
    expect(trust).toHaveBeenCalledTimes(1)
  })

  it('reads the certificate file exactly once, whatever the path', async () => {
    const certExists = vi.fn(() => true)
    await ensureLocalWpHttpsCert(DOMAIN, SITE, {
      deps: {
        certExists,
        ensureRunning: async () => ({
          ok: true,
          socketPath: '/tmp/mysql.sock',
          message: 'running',
          state: 'running'
        }),
        pokeHttps: vi.fn(),
        waitForCert: vi.fn(),
        trust: async () => ({ ok: true, message: 'trusted' })
      }
    })

    expect(certExists).toHaveBeenCalledTimes(1)
  })

  it('reports the ownership failure verbatim when no certificate is on disk', async () => {
    const trust = vi.fn()
    const result = await ensureLocalWpHttpsCert(DOMAIN, SITE, {
      deps: {
        certExists: () => false,
        ensureRunning: async () => ({
          ok: true,
          socketPath: '',
          message: 'LocalWP never reported ebes.local as one of its sites.',
          state: 'not-managed'
        }),
        pokeHttps: vi.fn(),
        waitForCert: vi.fn(),
        trust
      }
    })

    expect(result.ok).toBe(false)
    expect(result.message).toBe('LocalWP never reported ebes.local as one of its sites.')
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
    expect(result.message).toContain('five minutes')
  })

  // The signal is the only way out of this wait, and nothing else in the renderer can supply one:
  // it arrives from the wizard's Cancel through the IPC token. What is asserted here is that the
  // ownership wait sees it and that its cancellation is what the caller is told, rather than the
  // generic start failure.
  it('carries the caller signal into the ownership wait and reports its cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    const trust = vi.fn()
    const ensureRunning = vi.fn(async (_sitePath: string, options?: { signal?: AbortSignal }) => {
      expect(options?.signal).toBe(controller.signal)
      // What localwp-site-control returns once its registry poll observes the abort.
      return options?.signal?.aborted === true
        ? {
            ok: false,
            socketPath: '',
            state: 'failed' as const,
            message: 'Cancelled while waiting for LocalWP to register the site.'
          }
        : {
            ok: true,
            socketPath: '/tmp/mysql.sock',
            state: 'running' as const,
            message: 'started'
          }
    })

    const result = await ensureLocalWpHttpsCert(DOMAIN, SITE, {
      signal: controller.signal,
      deps: {
        certExists: () => false,
        ensureRunning,
        pokeHttps: vi.fn(),
        waitForCert: vi.fn(),
        trust
      }
    })

    expect(result.ok).toBe(false)
    // Verbatim: the cancellation the control layer reported, not a wrapped start failure.
    expect(result.message).toBe('Cancelled while waiting for LocalWP to register the site.')
    expect(trust).not.toHaveBeenCalled()
  })

  it('carries the caller signal into the certificate wait and names the cancellation', async () => {
    const controller = new AbortController()
    const waitForCert = vi.fn(async (_domain: string, options?: { signal?: AbortSignal }) => {
      expect(options?.signal).toBe(controller.signal)
      controller.abort()
      return false
    })

    const result = await ensureLocalWpHttpsCert(DOMAIN, SITE, {
      signal: controller.signal,
      deps: {
        certExists: () => false,
        ensureRunning: async () => ({
          ok: true,
          socketPath: '/tmp/mysql.sock',
          message: 'started',
          state: 'running'
        }),
        pokeHttps: async () => undefined,
        waitForCert,
        trust: vi.fn()
      }
    })

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Cancelled while waiting for LocalWP to write the certificate.')
    // Not the timeout copy: the user cancelled, the clock did not run out.
    expect(result.message).not.toContain('five minutes')
  })
})
