import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { ActiveCollabConnectDialog } from '@/components/activecollab-connect-dialog'
import { formatActiveCollabDueDate } from '@/components/activecollab-task-due-date'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { getActiveCollabReadScope } from '@/store/slices/activecollab-cache'
import { selectActiveCollabAssignedTasks } from './task-page-activecollab-cache-selectors'
import {
  deriveActiveCollabTaskListState,
  type ActiveCollabTaskListError
} from './task-page-activecollab-load-state'
import type {
  ActiveCollabFailure,
  ActiveCollabTaskRef
} from '../../../shared/activecollab-api-types'
import type { ActiveCollabLabel, ActiveCollabTask } from '../../../shared/activecollab-types'
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

/**
 * Everything the row shows also has to be announced, so the label carries the project, due day, and
 * labels that the visual row splits across columns.
 */
function taskRowAccessibleName(task: ActiveCollabTask, dueLabel: string | null): string {
  const parts = [
    translate('auto.components.activecollab.task_list.row_name', '{{value0}} in {{value1}}', {
      value0: task.name,
      value1: task.projectName
    })
  ]
  if (dueLabel) {
    parts.push(
      translate('auto.components.activecollab.task_list.row_due', 'due {{value0}}', {
        value0: dueLabel
      })
    )
  }
  if (task.labels.length > 0) {
    parts.push(
      translate('auto.components.activecollab.task_list.row_labels', 'labels {{value0}}', {
        value0: task.labels.map((label) => label.name).join(', ')
      })
    )
  }
  return parts.join(', ')
}

function ActiveCollabLabelChip({ label }: { label: ActiveCollabLabel }): React.JSX.Element {
  // Instance-defined hex, so it can only be an inline style; null falls back to the neutral chip.
  return (
    <span
      data-testid="activecollab-task-label"
      className={cn(
        'max-w-[120px] shrink-0 truncate rounded-full border px-1.5 py-0.5 text-[10px]',
        !label.color && 'border-border/50 bg-muted/35 text-muted-foreground'
      )}
      style={label.color ? { borderColor: label.color, color: label.color } : undefined}
    >
      {label.name}
    </span>
  )
}

function ActiveCollabTaskRow({
  onSelect,
  selected,
  task
}: {
  onSelect: (ref: ActiveCollabTaskRef) => void
  selected: boolean
  task: ActiveCollabTask
}): React.JSX.Element {
  // `dueOn` is already anchored to the local calendar day; re-deriving it from UTC would read a
  // day early east of UTC.
  const due = formatActiveCollabDueDate(task.dueOn)

  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        aria-label={taskRowAccessibleName(task, due?.label ?? null)}
        onClick={() => onSelect({ projectId: task.projectId, taskId: task.id })}
        className={cn(
          'grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
          selected && 'bg-accent'
        )}
      >
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-foreground">
            {task.name}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-[11px] text-muted-foreground">
              {task.projectName}
            </span>
            {task.labels.map((label) => (
              <ActiveCollabLabelChip key={label.id} label={label} />
            ))}
          </span>
        </span>
        {due ? (
          <time dateTime={due.iso} className="shrink-0 text-[12px] text-muted-foreground">
            {due.label}
          </time>
        ) : (
          <span className="shrink-0 text-[12px] text-muted-foreground">
            {translate('auto.components.activecollab.task_list.no_due_date', 'No due date')}
          </span>
        )}
      </button>
    </li>
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

// Why: one token addresses one instance, so this list has no site or project selector — the slice
// answers with every open task assigned to the connected user and paging is the only axis.
export function ActiveCollabTaskList({
  onSelect,
  selectedTaskId = null,
  sourceContext = null
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
  const state = deriveActiveCollabTaskListState({
    tasks: rows.tasks,
    hasMore: rows.hasMore,
    loading: scoped ? load.loading : true,
    failure: scoped ? load.failure : null
  })

  const retry = useCallback(() => void loadPage(1, true), [loadPage])
  const openConnect = useCallback(() => setConnectOpen(true), [])
  const errorBanner = state.kind === 'failed' || state.kind === 'ready' ? state.error : null

  return (
    <div className="flex min-h-0 flex-col">
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
        <>
          <ul
            role="list"
            aria-label={translate(
              'auto.components.activecollab.task_list.list_label',
              'ActiveCollab tasks assigned to you'
            )}
            className="divide-y divide-border/50"
          >
            {state.tasks.map((task) => (
              <ActiveCollabTaskRow
                key={task.id}
                onSelect={onSelect}
                selected={task.id === selectedTaskId}
                task={task}
              />
            ))}
          </ul>
          {state.hasMore ? (
            <div className="border-t border-border/50 p-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={state.loadingMore}
                onClick={() => void loadPage(rows.loadedPages + 1)}
              >
                {state.loadingMore ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                {translate('auto.components.activecollab.task_list.load_more', 'Load more tasks')}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
