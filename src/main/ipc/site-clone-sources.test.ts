import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CloneSourceListResult,
  CloneSourceProvider
} from '../../shared/site-clone-source-types'
import type { SiteResult } from '../../shared/site-types'
import type { Store } from '../persistence'
import type { isCloneSourceProviderId as CloneSourceProviderIdGuard } from '../sites/site-clone-sources'

const { handlers, removed, listCloneSourceProviders, listCloneSourceRepos } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, args?: unknown) => unknown>(),
  removed: [] as string[],
  listCloneSourceProviders: vi.fn(),
  listCloneSourceRepos: vi.fn()
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

// The registry has its own tests; what is under test here is the channel surface — names,
// argument validation, and the tagged-union wrapping. The real guard is deliberately not mocked,
// so this also proves the IPC layer rejects the same ids the registry would.
vi.mock('../sites/site-clone-sources', async () => {
  const actual = await vi.importActual<{
    isCloneSourceProviderId: typeof CloneSourceProviderIdGuard
  }>('../sites/site-clone-sources')
  return {
    isCloneSourceProviderId: actual.isCloneSourceProviderId,
    listCloneSourceProviders,
    listCloneSourceRepos
  }
})

import { registerSiteCloneSourceHandlers } from './site-clone-sources'

const PROVIDERS: CloneSourceProvider[] = [
  { id: 'bitbucket', label: 'Bitbucket', configured: true, reason: '' },
  {
    id: 'github',
    label: 'GitHub',
    configured: false,
    reason: 'Run gh auth login to connect GitHub.'
  }
]

const REPOS: CloneSourceListResult = {
  provider: 'bitbucket',
  repos: [],
  error: '',
  truncated: false
}

// Only the two readers the registry's exclusion touches; the rest of Store is irrelevant here.
const STORE = {
  getRepos: () => [],
  listSites: () => []
} as unknown as Store

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
  listCloneSourceProviders.mockResolvedValue(PROVIDERS)
  listCloneSourceRepos.mockResolvedValue(REPOS)
  registerSiteCloneSourceHandlers(STORE)
})

describe('registerSiteCloneSourceHandlers', () => {
  it('removes every channel before registering it, so a re-register cannot double-bind', () => {
    expect([...handlers.keys()].sort()).toEqual([
      'siteCloneSources:providers',
      'siteCloneSources:repos'
    ])
    expect(removed.sort()).toEqual([...handlers.keys()].sort())
  })

  it('returns the provider list', async () => {
    expect(await call('siteCloneSources:providers')).toEqual({ ok: true, value: PROVIDERS })
  })

  it('wraps a provider-list failure rather than rejecting across the bridge', async () => {
    listCloneSourceProviders.mockRejectedValue(new Error('userData is unreadable'))

    expect(await call('siteCloneSources:providers')).toEqual({
      ok: false,
      error: 'userData is unreadable'
    })
  })

  it('passes a known provider through to the registry', async () => {
    expect(await call('siteCloneSources:repos', { provider: 'github' })).toEqual({
      ok: true,
      value: REPOS
    })
    expect(listCloneSourceRepos).toHaveBeenCalledWith(STORE, 'github')
  })

  it('returns a failure for an unknown provider instead of throwing', async () => {
    expect(await call('siteCloneSources:repos', { provider: 'gitlab' })).toEqual({
      ok: false,
      error: 'siteCloneSources:repos requires { provider: "bitbucket" | "github" }'
    })
    expect(listCloneSourceRepos).not.toHaveBeenCalled()
  })

  it('returns a failure for a missing or non-string provider argument', async () => {
    for (const args of [undefined, {}, { provider: 7 }, { provider: null }]) {
      const result = await call('siteCloneSources:repos', args)
      expect(result.ok).toBe(false)
    }
    expect(listCloneSourceRepos).not.toHaveBeenCalled()
  })
})
