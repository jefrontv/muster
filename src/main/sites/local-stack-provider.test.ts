import { describe, expect, it } from 'vitest'
import {
  localStackProviders,
  providerFor,
  registerLocalStackProvider,
  type LocalStackProvider
} from './local-stack-provider'

describe('providerFor', () => {
  it('serves every stack in the enum', () => {
    for (const stack of ['plain', 'mamp', 'localwp'] as const) {
      expect(providerFor(stack).id).toBe(stack)
    }
  })

  it('treats plain and mamp as unmanaged: nothing to start, no credentials to discover', async () => {
    const site = { path: '/sites/example', localStack: 'plain' as const }

    const outcome = await providerFor('plain').ensureRunning(site)

    // ok: true — an unmanaged site is not a failure, the run proceeds on its stored transport.
    expect(outcome).toMatchObject({ ok: true, state: 'not-managed', socketPath: '' })
    await expect(providerFor('plain').credentials(site)).resolves.toBeNull()
  })

  it('falls back to unmanaged for a stack with no provider instead of throwing', async () => {
    const provider = providerFor('agent-local')

    expect(provider.id).toBe('agent-local')
    await expect(provider.isAvailable()).resolves.toBe(true)
  })
})

describe('registerLocalStackProvider', () => {
  it('replaces the fallback so a late-loading module can own its stack', async () => {
    const stub = {
      id: 'mamp',
      isAvailable: async () => false,
      detect: async () => {
        throw new Error('unused')
      },
      ensureRunning: async () => ({
        ok: true,
        socketPath: '',
        state: 'running' as const,
        message: 'stub'
      }),
      stop: async () => ({ ok: true, socketPath: '', state: 'stopped' as const, message: 'stub' }),
      credentials: async () => null,
      certStatus: async () => {
        throw new Error('unused')
      },
      certTrust: async () => {
        throw new Error('unused')
      }
    } as unknown as LocalStackProvider
    const original = providerFor('mamp')

    registerLocalStackProvider(stub)
    try {
      expect(await providerFor('mamp').isAvailable()).toBe(false)
      expect(localStackProviders().filter((entry) => entry.id === 'mamp')).toHaveLength(1)
    } finally {
      registerLocalStackProvider(original)
    }
  })
})
