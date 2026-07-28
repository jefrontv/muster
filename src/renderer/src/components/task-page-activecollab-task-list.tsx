import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { ActiveCollabConnectDialog } from '@/components/activecollab-connect-dialog'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getActiveCollabReadScope } from '@/store/slices/activecollab-cache'
import { selectActiveCollabAssignedTasks } from './task-page-activecollab-cache-selectors'
import {
  deriveActiveCollabTaskListState,
  type ActiveCollabTaskListError
} from './task-page-activecollab-load-state'
import { activeCollabGroupCollapseKey } from './task-page-activecollab-group-collapse'
import { ActiveCollabTaskGroupSection } from './task-page-activecollab-task-group-section'
import { groupActiveCollabTasksByProject } from './task-page-activecollab-task-grouping'
import type {
  ActiveCollabFailure,
  ActiveCollabTaskRef
} from '../../../shared/activecollab-api-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'

type ActiveCollabTaskListProps = {
  onSelect: (ref: ActiveCollabTaskRef) => void
  selectedTaskId?: number | null
  sourceContext?: TaskSourceContext | null
}

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

function ActiveCollabListError({
  error,
  onConnect,
  onRetry
}: {
  error: ActiveCollabTaskListError
  onConnect: () => void
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="border-b border-border/50 px-4 py-4">
      <p className="text-sm text-destructive">{error.message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {error.canConnect ? (
          <Button size="sm" onClick={onConnect}>
            {translate('auto.components.activecollab.task_list.connect', 'Connect ActiveCollab')}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={onRetry}>
          {translate('auto.components.activecollab.task_list.retry', 'Try again')}
        </Button>
      </div>
    </div>
  )
}

// Why: one token addresses one instance, so this list has no site selector — the slice answers
// with every open task assigned to the connected user, and paging is the only axis.
export function ActiveCollabTaskList({
  onSelect,
  selectedTaskId = null,
  sourceContext = null
}: ActiveCollabTaskListProps): React.JSX.Element {
  const listAssignedTasks = useAppStore((s) => s.listActiveCollabAssignedTasks)
  const taskPageCache = useAppStore((s) => s.activeCollabTaskPageCache)
  const settings = useAppStore((s) => s.settings)
  // Collapse rides the sidebar's shared `collapsedGroups` set rather than a second store: the ui
  // slice already writes it through `window.api.ui.set`, so it survives navigation and restart.
  const collapsedGroups = useAppStore((s) => s.collapsedGroups)
  const toggleCollapsedGroup = useAppStore((s) => s.toggleCollapsedGroup)
  const mountedRef = useMountedRef()

  // Paging, freshness, and the last fault are all per-scope, so they travel together stamped with
  // the scope that produced them. A read resolving after the runtime environment changed is then
  // dropped instead of writing another instance's error over the current one.
  const [load, setLoad] = useState<ActiveCollabTaskListLoad>(INITIAL_LOAD)
  const [connectOpen, setConnectOpen] = useState(false)

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

  // Derived rather than reset from an effect: until the reload lands, a changed scope must not
  // show the previous instance's paging or error.
  const scoped = load.prefix === cachePrefix
  const requestedPages = scoped ? load.requestedPages : 1

  const rows = useMemo(
    () => selectActiveCollabAssignedTasks(taskPageCache, cachePrefix, requestedPages),
    [cachePrefix, requestedPages, taskPageCache]
  )
  const loading = scoped ? load.loading : true
  const state = deriveActiveCollabTaskListState({
    tasks: rows.tasks,
    hasMore: rows.hasMore,
    loading,
    failure: scoped ? load.failure : null
  })

  // One clock reading feeds every row, so a render that straddles midnight cannot label two tasks
  // due the same day differently.
  const now = Date.now()
  const groups = useMemo(() => groupActiveCollabTasksByProject(rows.tasks), [rows.tasks])
  const retry = useCallback(() => void loadPage(1, true), [loadPage])
  const openConnect = useCallback(() => setConnectOpen(true), [])
  const toggleGroupCollapsed = useCallback(
    (projectId: number) => toggleCollapsedGroup(activeCollabGroupCollapseKey(projectId)),
    [toggleCollapsedGroup]
  )
  const errorBanner = state.kind === 'failed' || state.kind === 'ready' ? state.error : null
  // Why the footer outlives the `ready` state: `listAssignedTasks` filters completed tasks
  // client-side, so a server page can arrive with every row already dropped while later pages still
  // hold open work. Gating paging on a non-empty list would strand the user on "nothing here" with
  // those pages never requested.
  const canLoadMore = rows.hasMore && (state.kind === 'ready' || state.kind === 'empty')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ActiveCollabConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={retry}
      />

      {errorBanner ? (
        <ActiveCollabListError error={errorBanner} onConnect={openConnect} onRetry={retry} />
      ) : null}

      {state.kind === 'loading' ? (
        <div className="divide-y divide-border/50" data-testid="activecollab-task-list-skeleton">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="px-3 py-3">
              <div className="h-4 w-4/5 animate-pulse rounded bg-muted/70" />
              <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-muted/60" />
            </div>
          ))}
        </div>
      ) : null}

      {state.kind === 'empty' ? (
        <div className="px-4 py-10 text-center">
          <ActiveCollabIcon className="mx-auto mb-3 size-7 text-muted-foreground/60" />
          <p className="text-sm font-medium text-foreground">
            {translate('auto.components.activecollab.task_list.empty_title', 'No tasks assigned')}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {translate(
              'auto.components.activecollab.task_list.empty_body',
              'Nothing open is assigned to you in ActiveCollab right now.'
            )}
          </p>
        </div>
      ) : null}

      {state.kind === 'ready' ? (
        <div
          role="group"
          aria-label={translate(
            'auto.components.activecollab.task_list.list_label',
            'ActiveCollab tasks assigned to you'
          )}
          className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto"
        >
          {groups.map((group) => (
            <ActiveCollabTaskGroupSection
              key={group.projectId}
              collapsed={collapsedGroups.has(activeCollabGroupCollapseKey(group.projectId))}
              group={group}
              now={now}
              onSelect={onSelect}
              onToggleCollapsed={toggleGroupCollapsed}
              selectedTaskId={selectedTaskId}
            />
          ))}
        </div>
      ) : null}

      {canLoadMore ? (
        <div className="border-t border-border/50 p-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={loading}
            onClick={() => void loadPage(rows.loadedPages + 1)}
          >
            {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {translate('auto.components.activecollab.task_list.load_more', 'Load more tasks')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
