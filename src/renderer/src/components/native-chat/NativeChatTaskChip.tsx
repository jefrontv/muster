// Clickable ActiveCollab task chip for an `AC#77` reference in a message.
// Resolves name/completion live from the polled caches; click opens the Tasks
// surface with the task selected (embedded in chat mode, Tasks view otherwise).

import type React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { useAppStore } from '@/store'
import { findActiveCollabTaskInCaches } from './native-chat-activecollab-references'

export function NativeChatTaskChip({ taskId }: { taskId: number }): React.JSX.Element {
  const task = useAppStore(
    useShallow((s) => {
      const found = findActiveCollabTaskInCaches(s, taskId)
      return found
        ? { name: found.name, projectId: found.projectId, isCompleted: found.isCompleted }
        : null
    })
  )

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
      className="flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      <ActiveCollabIcon className="size-3 shrink-0" />
      <span className="shrink-0 font-medium">#{taskId}</span>
      {task ? (
        <span className={cn('max-w-48 truncate', task.isCompleted && 'line-through opacity-70')}>
          {task.name}
        </span>
      ) : null}
    </button>
  )
}
