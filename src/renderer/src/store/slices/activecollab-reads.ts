// Cache-backed ActiveCollab reads. Every read runs the same shape — serve fresh, join an in-flight
// twin, otherwise fetch and write back only if the runtime context still owns the result.
import type { AppState } from '../types'
import type { CacheEntry } from './github'
import type {
  ActiveCollabLabel,
  ActiveCollabProject,
  ActiveCollabTaskDetail,
  ActiveCollabUser
} from '../../../../shared/activecollab-types'
import type {
  ActiveCollabResult,
  ActiveCollabTaskRef
} from '../../../../shared/activecollab-api-types'
import {
  activeCollabGetTaskDetail,
  activeCollabListAssignedTasks,
  activeCollabListLabels,
  activeCollabListProjectMembers,
  activeCollabListProjects,
  activeCollabListUsers
} from '@/runtime/runtime-activecollab-client'
import {
  canWriteActiveCollabReadResult,
  currentActiveCollabMutation,
  getActiveCollabReadScope,
  isFresh,
  reusableInflightRead,
  scopedCacheKey,
  writeCacheEntry,
  type ActiveCollabInflightRead,
  type ActiveCollabReadOptions,
  type ActiveCollabReadScope,
  type ActiveCollabStoreGet,
  type ActiveCollabStoreSet
} from './activecollab-cache'
import { clearActiveCollabAttachmentImageFetches } from './activecollab-attachment-images'
import { shouldRefreshStatusAfterFailure } from './activecollab-failure'
import type { ActiveCollabTaskPageRows } from './activecollab-task-patch'

export type ActiveCollabReadActions = {
  listActiveCollabAssignedTasks: (
    args?: { page?: number },
    options?: ActiveCollabReadOptions
  ) => Promise<ActiveCollabResult<ActiveCollabTaskPageRows>>
  listActiveCollabProjects: (
    options?: ActiveCollabReadOptions
  ) => Promise<ActiveCollabResult<ActiveCollabProject[]>>
  fetchActiveCollabTaskDetail: (
    ref: ActiveCollabTaskRef,
    options?: ActiveCollabReadOptions
  ) => Promise<ActiveCollabResult<ActiveCollabTaskDetail>>
  listActiveCollabLabels: (
    options?: ActiveCollabReadOptions
  ) => Promise<ActiveCollabResult<ActiveCollabLabel[]>>
  /** The @mention roster. Only ever called once an author actually types `@`. */
  listActiveCollabUsers: (
    options?: ActiveCollabReadOptions
  ) => Promise<ActiveCollabResult<ActiveCollabUser[]>>
  /**
   * The people on one project. Same laziness as the roster, and an `ok: true` EMPTY value is a real
   * answer meaning "offer the roster instead" — see `ActiveCollabApi.listProjectMembers`.
   */
  listActiveCollabProjectMembers: (
    projectId: number,
    options?: ActiveCollabReadOptions
  ) => Promise<ActiveCollabResult<ActiveCollabUser[]>>
}

type InflightMap<T> = Map<string, ActiveCollabInflightRead<ActiveCollabResult<T>>>

const inflightTaskPages: InflightMap<ActiveCollabTaskPageRows> = new Map()
const inflightProjects: InflightMap<ActiveCollabProject[]> = new Map()
const inflightTaskDetails: InflightMap<ActiveCollabTaskDetail> = new Map()
const inflightLabels: InflightMap<ActiveCollabLabel[]> = new Map()
const inflightUsers: InflightMap<ActiveCollabUser[]> = new Map()
const inflightProjectMembers: InflightMap<ActiveCollabUser[]> = new Map()

/** Discarded on connect/disconnect so a superseded fetch cannot be joined by a fresh caller. */
export function clearActiveCollabInflightReads(): void {
  inflightTaskPages.clear()
  inflightProjects.clear()
  inflightTaskDetails.clear()
  inflightLabels.clear()
  inflightUsers.clear()
  inflightProjectMembers.clear()
  clearActiveCollabAttachmentImageFetches()
}

async function runCachedRead<T>(args: {
  set: ActiveCollabStoreSet
  get: ActiveCollabStoreGet
  scope: ActiveCollabReadScope
  cacheKey: string
  force: boolean
  inflight: InflightMap<T>
  selectCache: (state: AppState) => Record<string, CacheEntry<T>>
  writeCache: (cache: Record<string, CacheEntry<T>>) => Partial<AppState>
  fetch: () => Promise<ActiveCollabResult<T>>
}): Promise<ActiveCollabResult<T>> {
  const { set, get, scope, cacheKey, inflight, selectCache, writeCache, fetch } = args

  const cached = selectCache(get())[cacheKey]
  if (!args.force && isFresh(cached) && cached.data !== null) {
    return { ok: true, value: cached.data }
  }
  const reusable = reusableInflightRead(inflight, cacheKey, scope.contextKey)
  if (reusable) {
    return reusable
  }

  const generation = currentActiveCollabMutation()
  let entry: ActiveCollabInflightRead<ActiveCollabResult<T>>
  const promise = fetch()
    .then((result) => {
      if (!canWriteActiveCollabReadResult(scope, generation, get().settings)) {
        return result
      }
      if (result.ok) {
        set((s) => ({
          ...writeCache(writeCacheEntry(selectCache(s), cacheKey, result.value)),
          activeCollabLastError: null
        }))
        return result
      }
      set({ activeCollabLastError: result.error })
      if (shouldRefreshStatusAfterFailure(result)) {
        void get().checkActiveCollabConnection()
      }
      return result
    })
    .catch((error): ActiveCollabResult<T> => {
      // The client contract is result-typed, so a rejection here is a transport bug, not an answer.
      console.warn('[activecollab] read failed:', error)
      return {
        ok: false,
        kind: 'unknown',
        error: error instanceof Error ? error.message : String(error),
        status: null
      }
    })
    .finally(() => {
      if (inflight.get(cacheKey) === entry) {
        inflight.delete(cacheKey)
      }
    })
  entry = { promise, contextKey: scope.contextKey, mutationGeneration: generation }
  inflight.set(cacheKey, entry)
  return promise
}

export function createActiveCollabReadActions(
  set: ActiveCollabStoreSet,
  get: ActiveCollabStoreGet
): ActiveCollabReadActions {
  return {
    listActiveCollabAssignedTasks: async (args, options) => {
      const page = args?.page ?? 1
      const scope = getActiveCollabReadScope(get().settings, options?.sourceContext)
      return runCachedRead<ActiveCollabTaskPageRows>({
        set,
        get,
        scope,
        cacheKey: scopedCacheKey(scope, `tasks::assigned::${page}`),
        force: options?.force ?? false,
        inflight: inflightTaskPages,
        selectCache: (s) => s.activeCollabTaskPageCache,
        writeCache: (cache) => ({ activeCollabTaskPageCache: cache }),
        fetch: async () => {
          const result = await activeCollabListAssignedTasks({ page }, scope.settings)
          return result.ok ? { ok: true, value: { ...result.value, page } } : result
        }
      })
    },

    listActiveCollabProjects: async (options) => {
      const scope = getActiveCollabReadScope(get().settings, options?.sourceContext)
      return runCachedRead<ActiveCollabProject[]>({
        set,
        get,
        scope,
        cacheKey: scopedCacheKey(scope, 'projects'),
        force: options?.force ?? false,
        inflight: inflightProjects,
        selectCache: (s) => s.activeCollabProjectCache,
        writeCache: (cache) => ({ activeCollabProjectCache: cache }),
        fetch: () => activeCollabListProjects(scope.settings)
      })
    },

    fetchActiveCollabTaskDetail: async (ref, options) => {
      const scope = getActiveCollabReadScope(get().settings, options?.sourceContext)
      return runCachedRead<ActiveCollabTaskDetail>({
        set,
        get,
        scope,
        cacheKey: scopedCacheKey(scope, `detail::${ref.projectId}::${ref.taskId}`),
        force: options?.force ?? false,
        inflight: inflightTaskDetails,
        selectCache: (s) => s.activeCollabTaskDetailCache,
        writeCache: (cache) => ({ activeCollabTaskDetailCache: cache }),
        fetch: () => activeCollabGetTaskDetail(ref, scope.settings)
      })
    },

    listActiveCollabLabels: async (options) => {
      const scope = getActiveCollabReadScope(get().settings, options?.sourceContext)
      return runCachedRead<ActiveCollabLabel[]>({
        set,
        get,
        scope,
        cacheKey: scopedCacheKey(scope, 'labels'),
        force: options?.force ?? false,
        inflight: inflightLabels,
        selectCache: (s) => s.activeCollabLabelCache,
        writeCache: (cache) => ({ activeCollabLabelCache: cache }),
        fetch: () => activeCollabListLabels(scope.settings)
      })
    },

    listActiveCollabUsers: async (options) => {
      const scope = getActiveCollabReadScope(get().settings, options?.sourceContext)
      return runCachedRead<ActiveCollabUser[]>({
        set,
        get,
        scope,
        cacheKey: scopedCacheKey(scope, 'users'),
        force: options?.force ?? false,
        inflight: inflightUsers,
        selectCache: (s) => s.activeCollabUserCache,
        writeCache: (cache) => ({ activeCollabUserCache: cache }),
        fetch: () => activeCollabListUsers(scope.settings)
      })
    },

    listActiveCollabProjectMembers: async (projectId, options) => {
      const scope = getActiveCollabReadScope(get().settings, options?.sourceContext)
      return runCachedRead<ActiveCollabUser[]>({
        set,
        get,
        scope,
        cacheKey: scopedCacheKey(scope, `members::${projectId}`),
        force: options?.force ?? false,
        inflight: inflightProjectMembers,
        selectCache: (s) => s.activeCollabProjectMemberCache,
        writeCache: (cache) => ({ activeCollabProjectMemberCache: cache }),
        fetch: () => activeCollabListProjectMembers({ projectId }, scope.settings)
      })
    }
  }
}
