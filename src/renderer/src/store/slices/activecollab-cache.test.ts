import { describe, expect, it } from 'vitest'
import type { CacheEntry } from './github'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import {
  getTaskSourceCacheScope,
  type TaskSourceContext
} from '../../../../shared/task-source-context'
import {
  CACHE_MAX_AGE,
  CACHE_TTL,
  MAX_CACHE_ENTRIES,
  evictStaleEntries,
  getActiveCollabReadScope,
  isFresh,
  scopedCacheKey,
  writeCacheEntry
} from './activecollab-cache'

function entry(fetchedAt: number): CacheEntry<string> {
  return { data: `row-${fetchedAt}`, fetchedAt }
}

function sourceContext(environmentId: string): TaskSourceContext {
  return {
    kind: 'task-source',
    provider: 'activecollab',
    projectId: 'logical-project',
    hostId: `runtime:${environmentId}`,
    providerIdentity: {
      provider: 'activecollab',
      instanceUrl: 'https://projects.example.com'
    }
  }
}

describe('activeCollab cache freshness', () => {
  it('treats an entry as fresh until CACHE_TTL elapses', () => {
    const now = Date.now()
    expect(isFresh(entry(now))).toBe(true)
    expect(isFresh(entry(now - CACHE_TTL + 1_000))).toBe(true)
    expect(isFresh(entry(now - CACHE_TTL))).toBe(false)
    expect(isFresh(entry(now - CACHE_TTL - 1))).toBe(false)
    expect(isFresh(undefined)).toBe(false)
  })

  it('treats a zero fetchedAt as expired so a stale-marked row forces a refetch', () => {
    expect(isFresh(entry(0))).toBe(false)
  })
})

describe('activeCollab cache eviction', () => {
  // Recent timestamps: eviction age-prunes anything older than CACHE_MAX_AGE first,
  // so count-limit behavior is only observable on rows that survive the age rule.
  const now = Date.now()

  it('leaves a cache at or under the limit untouched by identity', () => {
    const cache = { a: entry(now - 2_000), b: entry(now - 1_000) }
    expect(evictStaleEntries(cache, 2)).toBe(cache)
  })

  it('drops the oldest entries once the cache passes the limit', () => {
    const cache: Record<string, CacheEntry<string>> = {
      oldest: entry(now - 3_000),
      middle: entry(now - 2_000),
      newest: entry(now - 1_000)
    }
    expect(Object.keys(evictStaleEntries(cache, 2)).sort()).toEqual(['middle', 'newest'])
  })

  it('drops entries older than CACHE_MAX_AGE even under the count limit', () => {
    const cache: Record<string, CacheEntry<string>> = {
      ancient: entry(now - CACHE_MAX_AGE - 1_000),
      recent: entry(now - 1_000)
    }
    expect(Object.keys(evictStaleEntries(cache, 10))).toEqual(['recent'])
  })

  it('prunes to MAX_CACHE_ENTRIES on write, keeping the newly written row', () => {
    let cache: Record<string, CacheEntry<string>> = {}
    for (let index = 0; index < MAX_CACHE_ENTRIES; index += 1) {
      cache[`seed-${index}`] = entry(now - MAX_CACHE_ENTRIES + index)
    }
    cache = writeCacheEntry(cache, 'fresh', 'value')

    expect(Object.keys(cache)).toHaveLength(MAX_CACHE_ENTRIES)
    expect(cache['seed-0']).toBeUndefined()
    expect(cache[`seed-${MAX_CACHE_ENTRIES - 1}`]).toBeDefined()
    expect(cache.fresh?.data).toBe('value')
  })
})

describe('activeCollab read scope', () => {
  it('prefixes implicit reads with the runtime context so two environments cannot collide', () => {
    const local = getActiveCollabReadScope(null)
    const remote = getActiveCollabReadScope({ activeRuntimeEnvironmentId: 'runtime-1' } as never)

    expect(local.cachePrefix).toBe(getProviderRuntimeContextKey(null))
    expect(local.explicitSource).toBe(false)
    expect(scopedCacheKey(local, 'projects')).not.toBe(scopedCacheKey(remote, 'projects'))
  })

  it('prefixes explicit source reads with the task-source scope', () => {
    const context = sourceContext('env-a')
    const scope = getActiveCollabReadScope(null, context)

    expect(scope.explicitSource).toBe(true)
    expect(scope.settings).toBe(context)
    expect(scope.cachePrefix).toBe(getTaskSourceCacheScope(context))
    expect(scopedCacheKey(scope, 'projects')).toBe(`${getTaskSourceCacheScope(context)}::projects`)
  })

  it('separates two source contexts that differ only by runtime host', () => {
    const a = getActiveCollabReadScope(null, sourceContext('env-a'))
    const b = getActiveCollabReadScope(null, sourceContext('env-b'))

    expect(a.cachePrefix).not.toBe(b.cachePrefix)
    expect(a.contextKey).not.toBe(b.contextKey)
  })

  it('keeps an explicit source scope stable when the focused runtime moves', () => {
    const context = sourceContext('env-a')
    const beforeFocusChange = getActiveCollabReadScope(null, context)
    const afterFocusChange = getActiveCollabReadScope(
      { activeRuntimeEnvironmentId: 'other-runtime' } as never,
      context
    )

    expect(afterFocusChange.cachePrefix).toBe(beforeFocusChange.cachePrefix)
    expect(afterFocusChange.contextKey).toBe(beforeFocusChange.contextKey)
  })
})
