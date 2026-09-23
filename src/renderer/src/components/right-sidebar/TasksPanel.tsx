// ActiveCollab tasks for the bound project, and the control that hands them to an agent.
//
// Bind once per Muster project, not per workspace: every worktree under it shares the binding, so a
// worktree made tomorrow already knows where its tasks come from.
//
// The list shows only tasks assigned to the connected user. That is the whole point of the panel —
// it answers "what should I pick up here", not "what is outstanding on this project".
//
// Opening a task keeps you in the panel rather than switching to the Tasks page, because reading
// one task is usually a step in sending it somewhere, and the page swap loses the selection.

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, LoaderCircle, RefreshCw, Send, X } from 'lucide-react'
import { ActiveCollabTaskWorkspace } from '@/components/ActiveCollabTaskWorkspace'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useActiveCollabRepoProject } from '@/hooks/useActiveCollabRepoProject'
import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import { buildActiveCollabTaskPrompt } from '../../../../shared/activecollab-task-prompt'
import { groupByTaskList, myOpenTasks } from './tasks-panel-projection'
import { useTasksPanelTasks } from './use-tasks-panel-tasks'
import { listTaskSendTargets } from './tasks-panel-send-targets'
import { TasksPanelList } from './tasks-panel-list'
import { TasksPanelProjectPicker } from './tasks-panel-project-picker'
import { TasksPanelSendBar } from './tasks-panel-send-bar'
import { TasksPanelSendMenu } from './tasks-panel-send-menu'

function PanelMessage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="px-3 py-4 text-xs text-muted-foreground">{children}</p>
}

export default function TasksPanel(): React.JSX.Element {
  const { repoId, projectId, bind } = useActiveCollabRepoProject()
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set())
  const [openTaskId, setOpenTaskId] = useState<number | null>(null)
  const { project, loading, error, reload, refreshQuietly } = useTasksPanelTasks(
    projectId,
    openTaskId === null
  )

  // The connection answers who "my tasks" means, and the detail pane reads the same record for its
  // instance URL. Checking it here means the panel works as a first stop after a restart.
  const userId = useAppStore((state) => state.activeCollabStatus.connection?.userId ?? null)
  const statusChecked = useAppStore((state) => state.activeCollabStatusChecked)
  const checkConnection = useAppStore((state) => state.checkActiveCollabConnection)
  useEffect(() => {
    if (!statusChecked) {
      void checkConnection()
    }
  }, [statusChecked, checkConnection])

  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const tabs = useAppStore((state) =>
    activeWorktreeId ? (state.tabsByWorktree[activeWorktreeId] ?? null) : null
  )
  const targets = useMemo(() => listTaskSendTargets(tabs), [tabs])

  const mine = useMemo(() => myOpenTasks(project, userId), [project, userId])
  const groups = useMemo(
    () => groupByTaskList(mine, project?.taskLists ?? []),
    [mine, project?.taskLists]
  )
  // Why the selection is derived rather than trusted: a task can leave the list between the click
  // that selected it and the click that sends it, and sending an id that is no longer shown would
  // point an agent at something the user cannot see.
  const chosen = useMemo(() => mine.filter((task) => selected.has(task.id)), [mine, selected])

  const toggle = (task: ActiveCollabTask): void => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(task.id)) {
        next.delete(task.id)
      } else {
        next.add(task.id)
      }
      return next
    })
  }

  if (!repoId) {
    return (
      <PanelMessage>
        {translate(
          'auto.components.right.sidebar.tasks.no_workspace',
          'Open a workspace to see its tasks.'
        )}
      </PanelMessage>
    )
  }

  if (projectId === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-4">
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.tasks.unbound',
            'Pick the ActiveCollab project this project’s work lives in. Every workspace under it shares the choice.'
          )}
        </p>
        <TasksPanelProjectPicker onSelect={(picked) => void bind(picked.id)} />
      </div>
    )
  }

  const projectName = project?.tasks[0]?.projectName ?? null
  const sendOneLabel = translate(
    'auto.components.right.sidebar.tasks.send_one',
    'Send this task to an agent'
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* One way back, and it is labelled. The task card carries its own close button, which sat
          directly under this row's X and left two identical icons meaning different things. */}
      {openTaskId !== null ? (
        <div className="flex items-center border-b border-border px-1.5 py-1.5">
          <Button
            variant="ghost"
            size="xs"
            className="gap-1 pl-1 pr-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setOpenTaskId(null)
              refreshQuietly()
            }}
          >
            <ChevronLeft className="size-3.5" />
            {translate('auto.components.right.sidebar.tasks.back', 'All tasks')}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium" title={projectName ?? ''}>
            {projectName ??
              translate('auto.components.right.sidebar.tasks.project', 'ActiveCollab project')}
          </span>
          <Button
            variant="ghost"
            size="xs"
            disabled={loading}
            onClick={reload}
            aria-label={translate('auto.components.right.sidebar.tasks.refresh', 'Refresh tasks')}
          >
            {loading ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void bind(null)}
            aria-label={translate('auto.components.right.sidebar.tasks.unbind', 'Change project')}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {openTaskId !== null ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ActiveCollabTaskWorkspace
            projectId={projectId}
            taskId={openTaskId}
            // The header's discuss button becomes "hand this one task to an agent", because that is
            // what the panel is for and the open task is already the thing in front of you.
            discussSlot={(task) => (
              <TasksPanelSendMenu
                targets={targets}
                buildPrompt={() => buildActiveCollabTaskPrompt([task])}
              >
                {({ sending, disabled }) => (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={disabled}
                    title={sendOneLabel}
                    aria-label={sendOneLabel}
                    className="-mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    {sending ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                  </Button>
                )}
              </TasksPanelSendMenu>
            )}
          />
        </div>
      ) : error ? (
        <PanelMessage>{error}</PanelMessage>
      ) : loading && project === null ? (
        <PanelMessage>
          {translate('auto.components.right.sidebar.tasks.loading', 'Reading your tasks…')}
        </PanelMessage>
      ) : groups.length === 0 ? (
        <PanelMessage>
          {translate(
            'auto.components.right.sidebar.tasks.empty',
            'Nothing in this project is assigned to you.'
          )}
        </PanelMessage>
      ) : (
        <TasksPanelList
          groups={groups}
          selected={selected}
          openTaskId={openTaskId}
          onToggle={toggle}
          onOpen={(task) => setOpenTaskId(task.id)}
        />
      )}

      {chosen.length > 0 ? (
        <TasksPanelSendBar
          targets={targets}
          count={chosen.length}
          onClear={() => setSelected(new Set())}
          buildPrompt={() => buildActiveCollabTaskPrompt(chosen)}
        />
      ) : null}
    </div>
  )
}
