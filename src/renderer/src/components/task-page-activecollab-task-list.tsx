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
import {
  groupActiveCollabTasksByProject,
  type ActiveCollabTaskGroup
} from './task-page-activecollab-task-grouping'
import { ActiveCollabTaskRow } from './task-page-activecollab-task-row'
import {
  activeCollabBindingDisplayName,
  filterActiveCollabTasksForBinding,
  type ActiveCollabBindingStatus
} from './activecollab-project-binding-state'
import type {
  ActiveCollabFailure,
  ActiveCollabTaskRef
} from '../../../shared/activecollab-api-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'

/** Module-level so the default prop keeps one identity and cannot churn the memos below. */
const UNBOUND_STATUS: ActiveCollabBindingStatus = { kind: 'unbound' }

type ActiveCollabTaskListProps = {
  onSelect: (ref: ActiveCollabTaskRef) => void
  selectedTaskId?: number | null
  sourceContext?: TaskSourceContext | null
  /** Scopes the rows to one ActiveCollab project. Client-side: the fetch stays account-wide. */
  bindingStatus?: ActiveCollabBindingStatus
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

/**
 * A project heading and its tasks are one unit for assistive tech: the heading names the group's
 * list through `aria-labelledby`, so entering the list announces the project instead of leaving the
 * rows as an unlabelled run. The count is decoration — the list element already reports its length,
 * and folding a bare number into the heading text would have it read as part of the project name.
 */
function ActiveCollabTaskGroupSection({
  group,
  now,
  onSelect,
  selectedTaskId
}: {
  group: ActiveCollabTaskGroup
  now: number
  onSelect: (ref: ActiveCollabTaskRef) => void
  selectedTaskId: number | null
}): React.JSX.Element {
  const headingId = `activecollab-task-group-${group.projectId}`
  return (
    // Why the group reads as a block: a plain `border-t` at the same weight as the row dividers
    // made a project boundary indistinguishable from a task boundary. The heading sits in its own
    // tinted band and the rows below it are divided more faintly, so the eye ranks "new project"
    // above "next task" instead of seeing one uniform stack of hairlines.
    //
    // No padding on the section: trailing space sits OUTSIDE the <ul>, so hovering the last row of
    // a group highlighted the row and then left a dead strip beneath it before the next heading,
    // which read as a broken hover. The heading's own band is the separator; it needs no help.
    <section>
      <h3
        id={headingId}
        className="sticky top-0 z-10 flex items-center justify-between gap-2 border-y border-border/60 bg-muted/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground backdrop-blur-sm"
      >
        <span className="min-w-0 truncate">{group.projectName}</span>
        <span
          aria-hidden="true"
          className="shrink-0 rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] tabular-nums"
        >
          {group.tasks.length}
        </span>
      </h3>
      <ul aria-labelledby={headingId} className="divide-y divide-border/30">
        {group.tasks.map((task) => (
          <ActiveCollabTaskRow
            key={task.id}
            now={now}
            onSelect={onSelect}
            selected={task.id === selectedTaskId}
            task={task}
          />
        ))}
      </ul>
    </section>
  )
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
// with every open task assigned to the connected user, and the only axes are paging and the
// caller's project binding, which narrows those rows here rather than at the request.
export function ActiveCollabTaskList({
  onSelect,
  selectedTaskId = null,
  sourceContext = null,
  bindingStatus = UNBOUND_STATUS
}: ActiveCollabTaskListProps): React.JSX.Element {
  const listAssignedTasks = useAppStore((s) => s.listActiveCollabAssignedTasks)
  const taskPageCache = useAppStore((s) => s.activeCollabTaskPageCache)
  const settings = useAppStore((s) => s.settings)
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
  // Narrowed here rather than at the request: `listAssignedTasks` is account-scoped and
  // ActiveCollab implements no server-side task filter, so a bound project can only hide rows that
  // were already paged in.
  const visibleTasks = useMemo(
    () => filterActiveCollabTasksForBinding(rows.tasks, bindingStatus),
    [bindingStatus, rows.tasks]
  )
  const bindingScopeName = activeCollabBindingDisplayName(bindingStatus)
  const loading = scoped ? load.loading : true
  const state = deriveActiveCollabTaskListState({
    tasks: visibleTasks,
    hasMore: rows.hasMore,
    loading,
    failure: scoped ? load.failure : null
  })

  // One clock reading feeds every row, so a render that straddles midnight cannot label two tasks
  // due the same day differently.
  const now = Date.now()
  const groups = useMemo(() => groupActiveCollabTasksByProject(visibleTasks), [visibleTasks])
  const retry = useCallback(() => void loadPage(1, true), [loadPage])
  const openConnect = useCallback(() => setConnectOpen(true), [])
  const errorBanner = state.kind === 'failed' || state.kind === 'ready' ? state.error : null
  // Why the footer outlives the `ready` state: under a binding a whole page can be other projects'
  // tasks, so "empty" is not the end of the list. Hiding paging there would strand the user on
  // "nothing here" while the pages holding their tasks were never requested.
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
            {bindingScopeName
              ? translate(
                  'auto.components.activecollab.task_list.empty_scoped_title',
                  'No tasks in {{value0}}',
                  { value0: bindingScopeName }
                )
              : translate(
                  'auto.components.activecollab.task_list.empty_title',
                  'No tasks assigned'
                )}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {!bindingScopeName
              ? translate(
                  'auto.components.activecollab.task_list.empty_body',
                  'Nothing open is assigned to you in ActiveCollab right now.'
                )
              : rows.hasMore
                ? translate(
                    'auto.components.activecollab.task_list.empty_scoped_more',
                    'None of the tasks loaded so far belong to {{value0}}. Load more to keep looking.',
                    { value0: bindingScopeName }
                  )
                : translate(
                    'auto.components.activecollab.task_list.empty_scoped_body',
                    'Nothing open is assigned to you in {{value0}} right now.',
                    { value0: bindingScopeName }
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
              group={group}
              now={now}
              onSelect={onSelect}
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
