// The linked-task strip above a chat thread's conversation. Reads as a compact
// sibling of the Tasks pane header (activecollab-task-header.tsx): same
// completion toggle anatomy, same muted band. Writes go through the same IPC
// the Tasks pane uses; the strip re-reads detail after a write so both agree.

import { Calendar, LoaderCircle, Check } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { useAppStore } from '@/store'

export function ChatThreadTaskStrip({
  projectId,
  taskId
}: {
  projectId: number
  taskId: number
}): React.JSX.Element | null {
  const [task, setTask] = useState<ActiveCollabTask | null>(null)
  const [writing, setWriting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.api.activecollab
      .getTaskDetail({ projectId, taskId })
      .then((result) => {
        if (!cancelled && result.ok) {
          setTask(result.value.task)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [projectId, taskId])

  if (!task) {
    return null
  }

  const toggleLabel = task.isCompleted
    ? translate('auto.components.chat.taskStrip.reopen', 'Reopen task')
    : translate('auto.components.chat.taskStrip.complete', 'Complete task')

  const toggleCompleted = async (): Promise<void> => {
    if (writing) {
      return
    }
    setWriting(true)
    try {
      const call = task.isCompleted
        ? window.api.activecollab.reopenTask({ taskId })
        : window.api.activecollab.completeTask({ taskId })
      const result = await call
      if (result.ok) {
        const detail = await window.api.activecollab.getTaskDetail({ projectId, taskId })
        if (detail.ok) {
          setTask(detail.value.task)
        }
      }
    } finally {
      setWriting(false)
    }
  }

  const openInTasks = (): void => {
    const store = useAppStore.getState()
    store.requestActiveCollabTask({ projectId, taskId })
    store.openTaskPage()
  }

  const due = task.dueOn !== null ? new Date(task.dueOn) : null
  const overdue = due !== null && !task.isCompleted && due.getTime() < Date.now()

  return (
    <div className="flex items-center gap-2.5 border-b border-border/50 bg-muted/30 px-4 py-2 text-xs">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-pressed={task.isCompleted}
            aria-label={toggleLabel}
            disabled={writing}
            onClick={() => void toggleCompleted()}
            className={cn(
              'flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-50',
              task.isCompleted
                ? 'border-primary bg-primary text-primary-foreground'
                : // Ghost check on hover — same affordance as the Tasks pane header.
                  'border-muted-foreground/40 text-transparent hover:border-foreground/60 hover:text-muted-foreground'
            )}
          >
            {writing ? (
              <LoaderCircle className="size-3 animate-spin text-muted-foreground" />
            ) : (
              <Check className="size-3" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{toggleLabel}</TooltipContent>
      </Tooltip>
      <button
        type="button"
        onClick={openInTasks}
        title={translate('auto.components.chat.taskStrip.openInTasks', 'Open in Tasks')}
        className="group flex min-w-0 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ActiveCollabIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span
          className={cn(
            'min-w-0 truncate text-[13px] font-medium text-foreground group-hover:underline',
            task.isCompleted && 'text-muted-foreground line-through'
          )}
        >
          {task.name}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">#{task.id}</span>
        {task.projectName ? (
          <span className="hidden min-w-0 truncate text-muted-foreground/70 md:inline">
            {task.projectName}
          </span>
        ) : null}
      </button>
      <span className="ml-auto flex shrink-0 items-center gap-3 text-muted-foreground">
        {task.assigneeName ? <span className="hidden sm:inline">{task.assigneeName}</span> : null}
        {due ? (
          <span
            className={cn(
              'flex items-center gap-1 tabular-nums',
              overdue && 'text-amber-700 dark:text-amber-300'
            )}
          >
            <Calendar className="size-3" />
            {due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        ) : null}
      </span>
    </div>
  )
}
