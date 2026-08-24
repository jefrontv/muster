// My Work: every open task assigned to the connected user, grouped by deadline or by project, with
// the filter bar, global search and quick-create the surface is planned from.
//
// Why no site selector: one token addresses one instance, so the slice answers with the whole
// assignment set and paging is the only axis. The read lifecycle lives in useActiveCollabMyWorkLoad;
// this file owns the surfaces and how the view slice narrows them.

import React, { useCallback, useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'

import { ActiveCollabConnectDialog } from '@/components/activecollab-connect-dialog'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ActiveCollabTaskListError } from './task-page-activecollab-load-state'
import { activeCollabGroupCollapseKey } from './task-page-activecollab-group-collapse'
import { ActiveCollabMyWorkCreateDialog } from './task-page-activecollab-my-work-create'
import { ActiveCollabMyWorkFilterBar } from './task-page-activecollab-my-work-filter-bar'
import {
  EMPTY_ACTIVECOLLAB_MY_WORK_FILTER,
  filterActiveCollabTasks,
  isActiveCollabMyWorkFilterActive
} from './task-page-activecollab-my-work-filter'
import { ActiveCollabMyWorkHeader } from './task-page-activecollab-my-work-header'
import { ActiveCollabMyWorkRows } from './task-page-activecollab-my-work-rows'
import { ActiveCollabProjectView } from './task-page-activecollab-project-view'
import { useActiveCollabMyWorkLoad } from './use-activecollab-my-work-load'
import type { ActiveCollabTaskRef } from '../../../shared/activecollab-api-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'

type ActiveCollabTaskListProps = {
  onSelect: (ref: ActiveCollabTaskRef) => void
  selectedTaskId?: number | null
  sourceContext?: TaskSourceContext | null
  /** Owned by the panel so the detail pane's project link can open the same view. */
  openProject?: { id: number; name: string } | null
  onOpenProject?: (id: number, name: string) => void
  onCloseProject?: () => void
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

export function ActiveCollabTaskList({
  onSelect,
  selectedTaskId = null,
  sourceContext = null,
  openProject = null,
  onOpenProject,
  onCloseProject
}: ActiveCollabTaskListProps): React.JSX.Element {
  // Collapse rides the sidebar's shared `collapsedGroups` set rather than a second store: the ui
  // slice already writes it through `window.api.ui.set`, so it survives navigation and restart.
  const collapsedGroups = useAppStore((s) => s.collapsedGroups)
  const toggleCollapsedGroup = useAppStore((s) => s.toggleCollapsedGroup)
  // Group axis and filter live beside the open task in the view slice, so a trip to another surface
  // and back returns to the same narrowed list rather than the whole assignment pile.
  const view = useAppStore((s) => s.activeCollabTaskPageView)
  const setFilter = useAppStore((s) => s.setActiveCollabTaskPageFilter)

  const [connectOpen, setConnectOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const { cachePrefix, rows, state, loading, canLoadMore, errorBanner, retry, loadNextPage } =
    useActiveCollabMyWorkLoad(sourceContext)

  const viewScoped = view?.scope === cachePrefix
  const filter = viewScoped ? view.filter : EMPTY_ACTIVECOLLAB_MY_WORK_FILTER
  const visible = useMemo(() => filterActiveCollabTasks(rows.tasks, filter), [filter, rows.tasks])

  // One clock reading feeds every row and every bucket boundary, so a render that straddles
  // midnight cannot file two tasks due the same day under different deadlines.
  const now = Date.now()
  const toggleGroupCollapsed = useCallback(
    (projectId: number) => toggleCollapsedGroup(activeCollabGroupCollapseKey(projectId)),
    [toggleCollapsedGroup]
  )
  const clearFilter = useCallback(
    () => setFilter(cachePrefix, EMPTY_ACTIVECOLLAB_MY_WORK_FILTER),
    [cachePrefix, setFilter]
  )

  // The drill-in replaces the assigned list while set; backing out restores the list with its
  // paging and scroll state intact because this component never unmounts around it.
  if (openProject && onCloseProject) {
    return (
      <ActiveCollabProjectView
        projectId={openProject.id}
        projectName={openProject.name}
        onBack={onCloseProject}
        onSelect={onSelect}
        selectedTaskId={selectedTaskId}
        sourceContext={sourceContext}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ActiveCollabConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={retry}
      />
      {createOpen ? (
        <ActiveCollabMyWorkCreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={retry}
          sourceContext={sourceContext}
        />
      ) : null}

      <ActiveCollabMyWorkHeader
        count={state.kind === 'ready' || state.kind === 'empty' ? visible.length : null}
        onOpenCreate={() => setCreateOpen(true)}
        onOpenProject={onOpenProject}
        onSelect={onSelect}
      />

      {state.kind === 'ready' ? (
        <ActiveCollabMyWorkFilterBar
          filter={filter}
          onChange={(next) => setFilter(cachePrefix, next)}
          tasks={rows.tasks}
        />
      ) : null}

      {errorBanner ? (
        <ActiveCollabListError
          error={errorBanner}
          onConnect={() => setConnectOpen(true)}
          onRetry={retry}
        />
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

      {/* A filter hiding everything is a state the user CAUSED, so it names the cause and offers
          the way out. Reusing "No tasks assigned" here told them the opposite of the truth. */}
      {state.kind === 'ready' && visible.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {translate(
              'auto.components.activecollab.my_work.filtered_empty_title',
              'No tasks match this filter'
            )}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {translate(
              'auto.components.activecollab.my_work.filtered_empty_body',
              '{{value0}} tasks are assigned to you, and none of them match what you narrowed to.',
              { value0: rows.tasks.length }
            )}
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={clearFilter}>
            {translate('auto.components.activecollab.my_work.filter_clear', 'Clear filters')}
          </Button>
        </div>
      ) : null}

      {state.kind === 'ready' && visible.length > 0 ? (
        <ActiveCollabMyWorkRows
          collapsedGroups={collapsedGroups}
          label={translate(
            'auto.components.activecollab.task_list.list_label',
            'ActiveCollab tasks assigned to you'
          )}
          now={now}
          onClearFilter={isActiveCollabMyWorkFilterActive(filter) ? clearFilter : undefined}
          onOpenProject={onOpenProject}
          onSelect={onSelect}
          onToggleGroupCollapsed={toggleGroupCollapsed}
          selectedTaskId={selectedTaskId}
          tasks={visible}
        />
      ) : null}

      {canLoadMore ? (
        <div className="border-t border-border/50 p-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={loading}
            onClick={loadNextPage}
          >
            {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {translate('auto.components.activecollab.task_list.load_more', 'Load more tasks')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
