// Reading and paging the assigned-task list. Split out of the list component so that file holds
// only the surfaces — buckets, filters, search and quick-create pushed it past the point where the
// load lifecycle could be read alongside them.
//
// Everything here is per-scope. Paging, freshness, and the last fault travel together stamped with
// the scope that produced them, so a read resolving after the runtime environment changed is
// dropped instead of writing another instance's error over the current one.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '@/store'
import { getActiveCollabReadScope } from '@/store/slices/activecollab-cache'
import {
  selectActiveCollabAssignedTasks,
  type ActiveCollabAssignedTaskRows
} from './task-page-activecollab-cache-selectors'
import {
  deriveActiveCollabTaskListState,
  type ActiveCollabTaskListError,
  type ActiveCollabTaskListState
} from './task-page-activecollab-load-state'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'

type ActiveCollabTaskListLoad = {
  /** The read scope these fields describe; a mismatch means they belong to a scope left behind. */
  prefix: string
  requestedPages: number
  loading: boolean
  failure: ActiveCollabFailure | null
}

/** No real scope is empty, so the first render always derives the loading surface. */
const INITIAL_LOAD: ActiveCollabTaskListLoad = {
  prefix: '',
  requestedPages: 1,
  loading: true,
  failure: null
}

/** Debounce for the unread broadcast: a burst must not become a burst of refetches. */
const REFETCH_DEBOUNCE_MS = 400

export type ActiveCollabMyWorkLoad = {
  /** The scope key every view-slice write is stamped with. */
  cachePrefix: string
  rows: ActiveCollabAssignedTaskRows
  state: ActiveCollabTaskListState
  loading: boolean
  canLoadMore: boolean
  errorBanner: ActiveCollabTaskListError | null
  retry: () => void
  loadNextPage: () => void
}

export function useActiveCollabMyWorkLoad(
  sourceContext: TaskSourceContext | null
): ActiveCollabMyWorkLoad {
  const listAssignedTasks = useAppStore((s) => s.listActiveCollabAssignedTasks)
  const taskPageCache = useAppStore((s) => s.activeCollabTaskPageCache)
  const settings = useAppStore((s) => s.settings)
  const mountedRef = useMountedRef()
  const [load, setLoad] = useState<ActiveCollabTaskListLoad>(INITIAL_LOAD)

  // A string, so an unstable `sourceContext` object identity cannot restart the load.
  const cachePrefix = useMemo(
    () => getActiveCollabReadScope(settings, sourceContext).cachePrefix,
    [settings, sourceContext]
  )
  const sourceContextRef = useRef(sourceContext)
  useEffect(() => {
    sourceContextRef.current = sourceContext
  }, [sourceContext])

  const loadPage = useCallback(
    async (page: number, force = false): Promise<void> => {
      setLoad((previous) =>
        previous.prefix === cachePrefix
          ? { ...previous, loading: true }
          : { prefix: cachePrefix, requestedPages: 1, loading: true, failure: null }
      )
      const result = await listAssignedTasks(
        { page },
        { sourceContext: sourceContextRef.current, force }
      )
      if (!mountedRef.current) {
        return
      }
      setLoad((previous) =>
        previous.prefix !== cachePrefix
          ? previous
          : {
              prefix: cachePrefix,
              requestedPages: result.ok
                ? Math.max(previous.requestedPages, page)
                : previous.requestedPages,
              loading: false,
              failure: result.ok ? null : result
            }
      )
    },
    [cachePrefix, listAssignedTasks, mountedRef]
  )

  useEffect(() => {
    void loadPage(1)
  }, [loadPage])

  // The main-process poller (Settings → Notifications cadence, default one minute) already detects
  // assignment and status changes; its unread broadcast doubles as the freshness signal here, so a
  // newly assigned task lands in an OPEN list at poll cadence instead of waiting for a remount.
  // Only a RISING total refetches: mark-read broadcasts (total falls, fired by merely opening a
  // task) were forcing a page-1 network read on top of the detail read that caused them.
  // Optional chaining: web/runtime stand-ins and unit suites mount this list without the bridge.
  const lastUnreadTotalRef = useRef(0)
  useEffect(() => {
    let timer: number | null = null
    const unsubscribe = window.api?.activecollab?.onUnreadChanged?.((unread) => {
      const previous = lastUnreadTotalRef.current
      lastUnreadTotalRef.current = unread.total
      if (unread.total <= previous) {
        return
      }
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      timer = window.setTimeout(() => {
        timer = null
        void loadPage(1, true)
      }, REFETCH_DEBOUNCE_MS)
    })
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      unsubscribe?.()
    }
  }, [loadPage])

  // Derived rather than reset from an effect: until the reload lands, a changed scope must not
  // show the previous instance's paging or error.
  const scoped = load.prefix === cachePrefix
  const requestedPages = scoped ? load.requestedPages : 1
  const rows = useMemo(
    () => selectActiveCollabAssignedTasks(taskPageCache, cachePrefix, requestedPages),
    [cachePrefix, requestedPages, taskPageCache]
  )
  const loading = scoped ? load.loading : true
  // Derived from the UNFILTERED rows: paging and "nothing is assigned to you" are facts about the
  // assignment set, and a filter narrowing it to zero must not read as either.
  const state = deriveActiveCollabTaskListState({
    tasks: rows.tasks,
    hasMore: rows.hasMore,
    loading,
    failure: scoped ? load.failure : null
  })

  const retry = useCallback(() => void loadPage(1, true), [loadPage])
  const loadNextPage = useCallback(
    () => void loadPage(rows.loadedPages + 1),
    [loadPage, rows.loadedPages]
  )

  return {
    cachePrefix,
    rows,
    state,
    loading,
    // Why paging outlives the `ready` state: `listAssignedTasks` filters completed tasks
    // client-side, so a server page can arrive with every row already dropped while later pages
    // still hold open work. Gating paging on a non-empty list would strand the user on "nothing
    // here" with those pages never requested.
    canLoadMore: rows.hasMore && (state.kind === 'ready' || state.kind === 'empty'),
    errorBanner: state.kind === 'failed' || state.kind === 'ready' ? state.error : null,
    retry,
    loadNextPage
  }
}
