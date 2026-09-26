import type React from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  isDueToday,
  isOverdue,
  useAssignedActiveCollabTasks
} from '@/components/chat-mode/use-active-collab-assigned-tasks'

// Why shared: Chat and Code sidebars used different counts (due vs unread) under the same label.
export function TaskDueBadge({ className }: { className?: string }): React.JSX.Element | null {
  const assignedTasks = useAssignedActiveCollabTasks()
  const now = Date.now()
  const overdueCount = (assignedTasks ?? []).filter((t) => isOverdue(t, now)).length
  const dueCount = overdueCount + (assignedTasks ?? []).filter((t) => isDueToday(t, now)).length
  if (dueCount === 0) {
    return null
  }
  return (
    <span
      title={translate('auto.components.chat.sidebar.tasksDue', 'Tasks due today or overdue')}
      className={cn(
        'flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums',
        overdueCount > 0
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
          : 'bg-muted text-muted-foreground',
        className
      )}
    >
      {dueCount}
    </span>
  )
}
