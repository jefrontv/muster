// The linked-task strip above a chat thread's conversation: completion toggle,
// task identity, due date. Writes go through the same IPC the Tasks pane uses;
// the strip re-reads detail after a write so both surfaces agree.

import { Calendar, LoaderCircle, Check } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
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
    <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-1.5 text-xs">
      <button
        type="button"
        aria-pressed={task.isCompleted}
        aria-label={
          task.isCompleted
            ? translate('auto.components.chat.taskStrip.reopen', 'Reopen task')
            : translate('auto.components.chat.taskStrip.complete', 'Complete task')
        }
        disabled={writing}
        onClick={() => void toggleCompleted()}
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
          task.isCompleted
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-border text-transparent hover:border-foreground/40 hover:text-muted-foreground'
        )}
      >
        {writing ? (
          <LoaderCircle className="size-2.5 animate-spin text-muted-foreground" />
        ) : (
          <Check className="size-2.5" />
        )}
      </button>
      <button
        type="button"
        onClick={openInTasks}
        title={translate('auto.components.chat.taskStrip.openInTasks', 'Open in Tasks')}
        className="flex min-w-0 items-center gap-1.5 rounded-sm text-left hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ActiveCollabIcon className="size-3 shrink-0 text-muted-foreground" />
        <span
          className={cn(
            'min-w-0 truncate font-medium text-foreground/90',
            task.isCompleted && 'text-muted-foreground line-through'
          )}
        >
          {task.name}
        </span>
        <span className="shrink-0 font-mono text-muted-foreground">#{task.id}</span>
      </button>
      <span className="ml-auto flex shrink-0 items-center gap-3 text-muted-foreground">
        {task.assigneeName ? <span className="hidden sm:inline">{task.assigneeName}</span> : null}
        {due ? (
          <span
            className={cn(
              'flex items-center gap-1',
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
