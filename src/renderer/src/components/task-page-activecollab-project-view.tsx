// The project drill-in: every open task in ONE project, sectioned by the project's own task lists
// the way the source instance shows them. Reached from a project heading in the assigned list;
// the back control returns there with the assigned list's state untouched (it stays mounted).

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, LoaderCircle, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { getActiveCollabReadScope } from '@/store/slices/activecollab-cache'
import {
  activeCollabCreateTask,
  activeCollabListProjectTasks
} from '@/runtime/runtime-activecollab-client'
import { ActiveCollabTaskCreateDialog } from './activecollab-task-create-dialog'
import {
  groupActiveCollabTasksByTaskList,
  type ActiveCollabTaskListGroup
} from './task-page-activecollab-task-grouping'
import { ActiveCollabTaskRow } from './task-page-activecollab-task-row'
import type {
  ActiveCollabTaskRef,
  ActiveCollabFailure
} from '../../../shared/activecollab-api-types'
import type {
  ActiveCollabProjectTasks,
  ActiveCollabTaskUpdate
} from '../../../shared/activecollab-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'

type ActiveCollabProjectViewProps = {
  projectId: number
  projectName: string
  onBack: () => void
  onSelect: (ref: ActiveCollabTaskRef) => void
  selectedTaskId?: number | null
  sourceContext?: TaskSourceContext | null
}

function taskListGroupLabel(group: ActiveCollabTaskListGroup): string {
  if (group.taskListName.length > 0) {
    return group.taskListName
  }
  return group.taskListId === null
    ? translate('auto.components.activecollab.project_view.no_list', 'Other tasks')
    : translate('auto.components.activecollab.project_view.unnamed_list', 'Task list {{id}}', {
        id: group.taskListId
      })
}

/** The per-list add row. Opens the full create dialog preselecting this section's list. */
function ActiveCollabTaskAddRow({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  return (
    <li className="list-none">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Plus className="size-3 shrink-0" />
        {translate('auto.components.activecollab.project_view.add_task', 'Add task')}
      </button>
    </li>
  )
}

function ActiveCollabTaskListSection({
  group,
  projectId,
  now,
  onSelect,
  selectedTaskId,
  onAddTask
}: {
  group: ActiveCollabTaskListGroup
  projectId: number
  now: number
  onSelect: (ref: ActiveCollabTaskRef) => void
  selectedTaskId: number | null
  onAddTask: (taskListId: number | null) => void
}): React.JSX.Element {
  const collapseKey = `activecollab-task-list:${projectId}:${group.taskListId ?? 'none'}`
  const collapsed = useAppStore((s) => s.collapsedGroups.has(collapseKey))
  const toggleCollapsedGroup = useAppStore((s) => s.toggleCollapsedGroup)
  const domKey = `${projectId}-${group.taskListId ?? 'none'}`
  const headingId = `activecollab-task-list-group-${domKey}`
  const listId = `activecollab-task-list-group-list-${domKey}`
  // Mirrors ActiveCollabTaskGroupSection's heading band so the two list surfaces read as siblings.
  return (
    <section>
      <h3
        id={headingId}
        className="sticky top-0 z-10 border-y border-border/60 bg-muted/80 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground backdrop-blur-sm"
      >
        <button
          type="button"
          aria-controls={listId}
          aria-expanded={!collapsed}
          onClick={() => toggleCollapsedGroup(collapseKey)}
          className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-left uppercase tracking-[inherit] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="min-w-0 truncate">{taskListGroupLabel(group)}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] tabular-nums"
            >
              {group.tasks.length}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn('size-3.5 transition-transform', collapsed && '-rotate-90')}
            />
          </span>
        </button>
      </h3>
      <ul
        aria-labelledby={headingId}
        className="divide-y divide-border/30"
        hidden={collapsed}
        id={listId}
      >
        {collapsed ? null : (
          <>
            {group.tasks.map((task) => (
              <ActiveCollabTaskRow
                key={task.id}
                now={now}
                onSelect={onSelect}
                selected={task.id === selectedTaskId}
                showAssignee
                task={task}
              />
            ))}
            <ActiveCollabTaskAddRow onOpen={() => onAddTask(group.taskListId)} />
          </>
        )}
      </ul>
    </section>
  )
}

export function ActiveCollabProjectView({
  projectId,
  projectName,
  onBack,
  onSelect,
  selectedTaskId = null,
  sourceContext = null
}: ActiveCollabProjectViewProps): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const mountedRef = useMountedRef()
  const [result, setResult] = useState<ActiveCollabProjectTasks | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<ActiveCollabFailure | null>(null)
  // Which section's add row opened the create dialog; null = dialog closed. Conditional render
  // remounts the dialog fresh per open, so its draft state never leaks between opens.
  const [createFor, setCreateFor] = useState<{ taskListId: number | null } | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setFailure(null)
    const scope = getActiveCollabReadScope(settings, sourceContext)
    const response = await activeCollabListProjectTasks({ projectId }, scope.settings)
    if (!mountedRef.current) {
      return
    }
    if (response.ok) {
      setResult(response.value)
    } else {
      setFailure(response)
    }
    setLoading(false)
    // Why settings/sourceContext are read at call time but excluded from deps via scope identity:
    // the caller unmounts this view on scope changes along with the rest of the tasks pane.
  }, [mountedRef, projectId, settings, sourceContext])

  useEffect(() => {
    void load()
  }, [load])

  const createTaskInList = useCallback(
    async (args: {
      taskListId: number | null
      update: ActiveCollabTaskUpdate
      attachmentCodes: string[]
    }): Promise<ActiveCollabFailure | null> => {
      const scope = getActiveCollabReadScope(settings, sourceContext)
      const response = await activeCollabCreateTask(
        {
          projectId,
          taskListId: args.taskListId,
          update: args.update,
          attachmentCodes: args.attachmentCodes
        },
        scope.settings
      )
      if (!mountedRef.current) {
        return null
      }
      if (!response.ok) {
        return response
      }
      const task = response.value
      if (task) {
        // The echoed row lands straight in the local result; grouping re-derives from it.
        setResult((previous) =>
          previous ? { ...previous, tasks: [...previous.tasks, task] } : previous
        )
      } else {
        // Landed but no usable echo: refetch rather than showing a list missing its newest row.
        void load()
      }
      return null
    },
    [load, mountedRef, projectId, settings, sourceContext]
  )

  const now = Date.now()
  const groups = useMemo(
    () => (result ? groupActiveCollabTasksByTaskList(result.tasks, result.taskLists) : []),
    [result]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[41px] items-center gap-2 border-b border-border/50 px-2 py-2">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={translate(
            'auto.components.activecollab.project_view.back',
            'Back to your assigned tasks'
          )}
          onClick={onBack}
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <span className="min-w-0 truncate text-sm font-semibold">{projectName}</span>
        {result ? (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {result.tasks.length}
          </span>
        ) : null}
      </div>

      {failure ? (
        <div className="border-b border-border/50 px-4 py-4">
          <p className="text-sm text-destructive">{failure.error}</p>
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => void load()}>
              {translate('auto.components.activecollab.task_list.retry', 'Try again')}
            </Button>
          </div>
        </div>
      ) : null}

      {loading && !result ? (
        <div className="divide-y divide-border/50" data-testid="activecollab-project-view-skeleton">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="px-3 py-3">
              <div className="h-4 w-4/5 animate-pulse rounded bg-muted/70" />
              <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-muted/60" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && !failure && groups.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {translate('auto.components.activecollab.project_view.empty_title', 'No open tasks')}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {translate(
              'auto.components.activecollab.project_view.empty_body',
              'Everything in this project is completed.'
            )}
          </p>
        </div>
      ) : null}

      {groups.length > 0 ? (
        <div
          role="group"
          aria-label={translate(
            'auto.components.activecollab.project_view.list_label',
            'Tasks in {{project}}',
            { project: projectName }
          )}
          className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto"
        >
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground">
              <LoaderCircle className="size-3 animate-spin" />
              {translate('auto.components.activecollab.project_view.refreshing', 'Refreshing…')}
            </div>
          ) : null}
          {groups.map((group) => (
            <ActiveCollabTaskListSection
              key={`${group.taskListId ?? 'none'}`}
              group={group}
              projectId={projectId}
              now={now}
              onSelect={onSelect}
              selectedTaskId={selectedTaskId}
              onAddTask={(taskListId) => setCreateFor({ taskListId })}
            />
          ))}
        </div>
      ) : null}

      {createFor && result ? (
        <ActiveCollabTaskCreateDialog
          projectId={projectId}
          taskLists={result.taskLists}
          initialTaskListId={createFor.taskListId}
          onClose={() => setCreateFor(null)}
          onCreate={createTaskInList}
        />
      ) : null}
    </div>
  )
}
