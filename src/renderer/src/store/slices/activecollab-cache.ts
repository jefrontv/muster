// Cache mechanics for the ActiveCollab slice: freshness, LRU pruning, and the scope/generation
// guards that stop one runtime context from serving another context's rows.
import type { GlobalSettings } from '../../../../shared/types'
import type { AppState } from '../types'
import type { CacheEntry } from './github'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import {
  getTaskSourceCacheScope,
  getTaskSourceRuntimeSettings,
  type TaskSourceContext
} from '../../../../shared/task-source-context'

export const CACHE_TTL = 60_000
export const MAX_CACHE_ENTRIES = 500

/** Matches the runtime client's settings parameter without importing it, so the two land apart. */
export type ActiveCollabRuntimeSettings =
  | Pick<GlobalSettings, 'activeRuntimeEnvironmentId'>
  | TaskSourceContext
  | null
  | undefined

export type ActiveCollabStoreSet = (
  partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)
) => void
export type ActiveCollabStoreGet = () => AppState

export type ActiveCollabReadOptions = {
  sourceContext?: TaskSourceContext | null
  /** Skip the freshness check for an explicit user refresh. */
  force?: boolean
}

export function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() - entry.fetchedAt < CACHE_TTL
}

export function evictStaleEntries<T>(
  cache: Record<string, CacheEntry<T>>,
  maxEntries = MAX_CACHE_ENTRIES
): Record<string, CacheEntry<T>> {
  const keys = Object.keys(cache)
  if (keys.length <= maxEntries) {
    return cache
  }
  const sorted = keys.sort((a, b) => (cache[a]?.fetchedAt ?? 0) - (cache[b]?.fetchedAt ?? 0))
  const pruned: Record<string, CacheEntry<T>> = {}
  for (const key of sorted.slice(sorted.length - maxEntries)) {
    const entry = cache[key]
    if (entry) {
      pruned[key] = entry
    }
  }
  return pruned
}

export function writeCacheEntry<T>(
  cache: Record<string, CacheEntry<T>>,
  key: string,
  data: T
): Record<string, CacheEntry<T>> {
  return evictStaleEntries({ ...cache, [key]: { data, fetchedAt: Date.now() } })
}

export type ActiveCollabReadScope = {
  settings: ActiveCollabRuntimeSettings
  contextKey: string
  cachePrefix: string
  explicitSource: boolean
}

/**
 * Every key carries a prefix, including the implicit path: an unprefixed key would let two runtime
 * environments read each other's rows out of the same cache slot.
 */
export function getActiveCollabReadScope(
  settings: AppState['settings'],
  sourceContext?: TaskSourceContext | null
): ActiveCollabReadScope {
  if (!sourceContext) {
    const contextKey = getProviderRuntimeContextKey(settings)
    return { settings, contextKey, cachePrefix: contextKey, explicitSource: false }
  }
  const runtimeSettings = getTaskSourceRuntimeSettings(sourceContext)
  const cachePrefix = getTaskSourceCacheScope(sourceContext)
  return {
    settings: sourceContext,
    contextKey: `${getProviderRuntimeContextKey(runtimeSettings)}::${cachePrefix}`,
    cachePrefix,
    explicitSource: true
  }
}

export function scopedCacheKey(scope: ActiveCollabReadScope, key: string): string {
  return `${scope.cachePrefix}::${key}`
}

export type ActiveCollabInflightRead<T> = {
  promise: Promise<T>
  contextKey: string
  mutationGeneration: number
}

let mutationGeneration = 0

/** Connect/disconnect only: a task edit does not change whose rows the caches hold. */
export function beginActiveCollabMutation(): number {
  mutationGeneration += 1
  return mutationGeneration
}

export function currentActiveCollabMutation(): number {
  return mutationGeneration
}

export function isCurrentActiveCollabMutation(generation: number): boolean {
  return generation === mutationGeneration
}

export function isCurrentActiveCollabRuntimeContext(
  contextKey: string,
  settings: AppState['settings']
): boolean {
  return getProviderRuntimeContextKey(settings) === contextKey
}

export function canWriteActiveCollabReadResult(
  scope: ActiveCollabReadScope,
  generation: number,
  settings: AppState['settings']
): boolean {
  return (
    generation === mutationGeneration &&
    (scope.explicitSource || isCurrentActiveCollabRuntimeContext(scope.contextKey, settings))
  )
}

export function reusableInflightRead<T>(
  inflight: Map<string, ActiveCollabInflightRead<T>>,
  key: string,
  contextKey: string
): Promise<T> | null {
  const entry = inflight.get(key)
  return entry && entry.contextKey === contextKey && entry.mutationGeneration === mutationGeneration
    ? entry.promise
    : null
}
