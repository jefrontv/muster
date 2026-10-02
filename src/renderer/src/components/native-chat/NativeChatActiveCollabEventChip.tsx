// An ActiveCollab write as a task event ("Completed task #77"): an outcome,
// not plumbing, so it stays visible in both surfaces. Opens the task when it
// knows which one.

import { CircleCheck, MessageSquareText } from 'lucide-react'
import type { ActiveCollabToolEvent } from '../../../../shared/native-chat-activecollab-events'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { findActiveCollabTaskInCaches } from './native-chat-activecollab-references'

export function NativeChatActiveCollabEventChip({
  event
}: {
  event: ActiveCollabToolEvent
}): React.JSX.Element {
  const done = event.kind === 'complete'
  const openable = event.taskId !== null
  const className = cn(
    'flex max-w-full items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-3 text-xs font-medium',
    done
      ? 'border-status-success-border bg-status-success-background text-status-success'
      : 'border-border/60 bg-muted/40 text-muted-foreground',
    openable && 'transition-colors hover:bg-accent hover:text-accent-foreground'
  )
  const body = (
    <>
      {done ? (
        <CircleCheck className="size-3.5 shrink-0" />
      ) : event.kind === 'comment' ? (
        <MessageSquareText className="size-3.5 shrink-0" />
      ) : (
        <ActiveCollabIcon className="size-3 shrink-0" />
      )}
      <span className="min-w-0 truncate">{event.label}</span>
    </>
  )
  if (!openable) {
    return <span className={className}>{body}</span>
  }
  const open = (): void => {
    const store = useAppStore.getState()
    const taskId = event.taskId!
    // Input carries the project when the tool required one; the polled caches cover the rest.
    const projectId =
      event.projectId ?? findActiveCollabTaskInCaches(store, taskId)?.projectId ?? null
    if (projectId !== null) {
      store.requestActiveCollabTask({ projectId, taskId })
    }
    store.openTaskPage()
  }
  return (
    <button
      type="button"
      onClick={open}
      title={translate('auto.components.native-chat.taskChip.unknown', 'Open in Tasks')}
      className={cn(
        className,
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {body}
    </button>
  )
}
