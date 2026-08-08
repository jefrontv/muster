// Up to three urgent assigned ActiveCollab tasks under the hero composer —
// one click starts a linked, pre-briefed chat about the task (Discuss-in-chat
// path). Hidden when nothing is urgent or ActiveCollab is not connected.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { discussTaskInChat } from './chat-thread-task-discussion'
import {
  isDueToday,
  isOverdue,
  urgentActiveCollabTasks,
  useAssignedActiveCollabTasks
} from './use-active-collab-assigned-tasks'

const MAX_SHORTCUTS = 3

export function ChatModeHeroTaskShortcuts(): React.JSX.Element | null {
  const tasks = useAssignedActiveCollabTasks()
  const now = Date.now()
  const urgent = tasks
    ? urgentActiveCollabTasks(tasks, now)
        .filter((task) => isOverdue(task, now) || isDueToday(task, now))
        .slice(0, MAX_SHORTCUTS)
    : []
  if (urgent.length === 0) {
    return null
  }
  return (
    <div className="flex w-full max-w-2xl flex-wrap items-center justify-center gap-1.5">
      {urgent.map((task) => {
        const overdue = isOverdue(task, now)
        return (
          <button
            key={task.id}
            type="button"
            onClick={() => void discussTaskInChat(task)}
            title={`${task.projectName} · #${task.id}`}
            className="flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <ActiveCollabIcon className="size-3 shrink-0" />
            <span
              className={cn(
                'shrink-0 font-medium',
                overdue ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
              )}
            >
              {overdue
                ? translate('auto.components.chat.hero.taskOverdue', 'Overdue')
                : translate('auto.components.chat.hero.taskDueToday', 'Due today')}
            </span>
            <span className="max-w-64 truncate">{task.name}</span>
          </button>
        )
      })}
    </div>
  )
}
