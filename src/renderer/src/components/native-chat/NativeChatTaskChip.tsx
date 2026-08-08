// Clickable ActiveCollab task chip for an `AC#77` reference in a message.
// Styled as a sibling of the file-attachment chips it renders beside. Name and
// completion resolve from the polled caches, falling back to a one-shot
// assigned-tasks fetch; click opens the Tasks surface with the task selected.

import type React from 'react'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import { useAppStore } from '@/store'
import { findActiveCollabTaskInCaches } from './native-chat-activecollab-references'

// One fetch per session shared by every chip whose task the caches don't know.
let assignedTasksOnce: Promise<ActiveCollabTask[]> | null = null
function loadAssignedTasksOnce(): Promise<ActiveCollabTask[]> {
  assignedTasksOnce ??= window.api.activecollab
    .listAssignedTasks()
    .then((result) => (result.ok ? result.value.tasks : []))
    .catch(() => [])
  return assignedTasksOnce
}

type ChipTask = { name: string; projectId: number; isCompleted: boolean }

export function NativeChatTaskChip({ taskId }: { taskId: number }): React.JSX.Element {
  const cached = useAppStore(
    useShallow((s): ChipTask | null => {
      const found = findActiveCollabTaskInCaches(s, taskId)
      return found
        ? { name: found.name, projectId: found.projectId, isCompleted: found.isCompleted }
        : null
    })
  )
  const [fetched, setFetched] = useState<ChipTask | null>(null)
  const task = cached ?? fetched

  useEffect(() => {
    if (cached) {
      return
    }
    let cancelled = false
    void loadAssignedTasksOnce().then((tasks) => {
      const found = tasks.find((candidate) => candidate.id === taskId)
      if (!cancelled && found) {
        setFetched({
          name: found.name,
          projectId: found.projectId,
          isCompleted: found.isCompleted
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [cached, taskId])

  const open = (): void => {
    const store = useAppStore.getState()
    if (task) {
      store.requestActiveCollabTask({ projectId: task.projectId, taskId })
    }
    store.openTaskPage()
  }

  return (
    <button
      type="button"
      onClick={open}
      title={
        task?.name ?? translate('auto.components.native-chat.taskChip.unknown', 'Open in Tasks')
      }
      className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ActiveCollabIcon className="size-3.5 shrink-0" />
      {task ? (
        <span
          className={cn(
            'max-w-56 truncate font-medium text-foreground/90',
            task.isCompleted && 'text-muted-foreground line-through'
          )}
        >
          {task.name}
        </span>
      ) : (
        <span className="font-medium">
          {translate('auto.components.native-chat.taskChip.fallback', 'Task')}
        </span>
      )}
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">#{taskId}</span>
    </button>
  )
}
