import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteSetupPlan } from '../../shared/site-setup-flow-types'
import type { SiteResult } from '../../shared/site-types'
import type { Store } from '../persistence'

const { handlers, removed, buildSiteSetupPlan, resolveSiteSetupCloneTargets } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, args?: unknown) => unknown>(),
  removed: [] as string[],
  buildSiteSetupPlan: vi.fn(),
  resolveSiteSetupCloneTargets: vi.fn()
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

// The planner and the connector have their own tests; what is under test here is the channel
// surface — names, argument validation, and the tagged-union wrapping.
vi.mock('../sites/site-setup-plan', () => ({ buildSiteSetupPlan }))
vi.mock('../sites/site-setup-clone-targets', () => ({ resolveSiteSetupCloneTargets }))

import { registerSiteSetupHandlers } from './site-setup'

const PLAN: SiteSetupPlan = {
  siteId: 'site-1',
  stages: [{ id: 'bind', state: 'done', reason: '' }],
  clone: { connectorConfigured: false, targets: [], error: '' },
  stack: { supported: true, alreadyLocalWp: false, suggestedDomain: 'acme.local', reason: '' },
  import: {
    ready: true,
    blockedBy: [],
    confirmable: false,
    environment: 'main',
    enabledStepCount: 1
  }
}

const store = {} as Store

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
  buildSiteSetupPlan.mockResolvedValue(PLAN)
  resolveSiteSetupCloneTargets.mockResolvedValue({
    connectorConfigured: true,
    targets: [],
    error: ''
  })
  registerSiteSetupHandlers(store)
})

describe('registerSiteSetupHandlers', () => {
  it('removes every channel before registering it, so a re-register cannot double-bind', () => {
    expect([...handlers.keys()].sort()).toEqual(['siteSetup:cloneTargets', 'siteSetup:plan'])
    expect(removed.sort()).toEqual([...handlers.keys()].sort())
  })

  it('normalises an absent reponame and branch rather than rejecting the call', async () => {
    expect(await call('siteSetup:plan', { siteId: 'site-1' })).toEqual({ ok: true, value: PLAN })
    expect(buildSiteSetupPlan).toHaveBeenCalledWith(store, {
      siteId: 'site-1',
      reponame: '',
      branch: null
    })
  })

  it('collapses an empty branch to null, which reads as "branch unknown"', async () => {
    await call('siteSetup:plan', { siteId: 'site-1', reponame: 'acme', branch: '   ' })
    expect(buildSiteSetupPlan).toHaveBeenCalledWith(store, {
      siteId: 'site-1',
      reponame: 'acme',
      branch: null
    })
  })

  it('returns a failure result rather than throwing for a missing or oversized siteId', async () => {
    expect(await call('siteSetup:plan', {})).toEqual({
      ok: false,
      error: 'siteId must be a non-empty string'
    })
    expect(await call('siteSetup:plan', { siteId: 'x'.repeat(257) })).toEqual({
      ok: false,
      error: 'siteId must be a non-empty string'
    })
    expect(buildSiteSetupPlan).not.toHaveBeenCalled()
  })

  it('caps the reponame so a compromised renderer cannot push an unbounded lookup', async () => {
    const result = await call('siteSetup:cloneTargets', { reponame: 'r'.repeat(257) })
    expect(result.ok).toBe(false)
    expect(resolveSiteSetupCloneTargets).not.toHaveBeenCalled()
  })

  it('surfaces a planner throw as a tagged failure, never across the bridge', async () => {
    buildSiteSetupPlan.mockRejectedValue(new Error('Unknown site: site-9'))
    expect(await call('siteSetup:plan', { siteId: 'site-9' })).toEqual({
      ok: false,
      error: 'Unknown site: site-9'
    })
  })

  it('resolves clone targets on their own channel for a retry after configuring the connector', async () => {
    const result = await call('siteSetup:cloneTargets', { reponame: 'efront_au/acme' })
    expect(result).toEqual({
      ok: true,
      value: { connectorConfigured: true, targets: [], error: '' }
    })
    expect(resolveSiteSetupCloneTargets).toHaveBeenCalledWith('efront_au/acme')
  })
})
