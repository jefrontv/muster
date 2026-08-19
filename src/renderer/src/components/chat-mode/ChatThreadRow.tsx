// One thread row in the chat sidebar: title, T3-style status label cluster, and
// the row menu (rename/delete). Rename edits inline so the list keeps its place.

import { CircleCheck, MoreHorizontal, ShieldQuestion } from 'lucide-react'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { ChatThread } from '../../../../shared/chat-mode-types'
import {
  deriveChatThreadTitle,
  isChatWorkspaceBriefTitle
} from '../../../../shared/chat-workspace-site-info'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { formatNativeChatWorkingElapsed } from '../native-chat/native-chat-duration-format'
import {
  hasUnseenCompletion,
  resolveChatThreadStatus,
  type ChatThreadStatus
} from './chat-thread-status'

/** Self-ticking elapsed (setInterval → textContent), NOT React state: a state
 *  tick would re-commit every working row each second (T3/NativeChatWorkingRow). */
function WorkingElapsed({ since }: { since: number }): React.JSX.Element {
  const textRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    const update = (): void => {
      if (textRef.current) {
        textRef.current.textContent = formatNativeChatWorkingElapsed(Date.now() - since)
      }
    }
    update()
    const id = window.setInterval(update, 1_000)
    return () => window.clearInterval(id)
  }, [since])
  return (
    <span ref={textRef} className="tabular-nums">
      {formatNativeChatWorkingElapsed(Date.now() - since)}
    </span>
  )
}

/** T3 SidebarV2 attention hues: amber = act now, sky = in motion, emerald = unread done. */
function ThreadStatusLabel({
  status,
  workingSince
}: {
  status: ChatThreadStatus
  workingSince: number | undefined
}): React.JSX.Element | null {
  if (status === 'approval') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
        <ShieldQuestion className="size-3" />
        {translate('auto.components.chat.sidebar.statusApproval', 'Approval')}
      </span>
    )
  }
  if (status === 'working') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400">
        <span className="size-1.5 animate-pulse rounded-full bg-sky-400" />
        {/* aria-hidden: a ticking timer would be announced every second. */}
        <span aria-hidden>
          {translate('auto.components.chat.sidebar.statusWorking', 'Working')}
          {workingSince !== undefined ? (
            <>
              {' '}
              <WorkingElapsed since={workingSince} />
            </>
          ) : null}
        </span>
      </span>
    )
  }
  if (status === 'unread-done') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300">
        <CircleCheck className="size-3" />
        {translate('auto.components.chat.sidebar.statusDone', 'Done')}
      </span>
    )
  }
  return null
}

export type ChatThreadRowDragProps = {
  draggable: boolean
  onDragStart: (event: React.DragEvent<HTMLLIElement>) => void
  onDragOver: (event: React.DragEvent<HTMLLIElement>) => void
  onDragLeave: (event: React.DragEvent<HTMLLIElement>) => void
  onDrop: (event: React.DragEvent<HTMLLIElement>) => void
  onDragEnd: (event: React.DragEvent<HTMLLIElement>) => void
}

export function ChatThreadRow({
  thread,
  dragProps,
  isDragging = false,
  dropEdge = null
}: {
  thread: ChatThread
  dragProps?: ChatThreadRowDragProps
  isDragging?: boolean
  /** Insert-position indicator while another row is dragged over this one. */
  dropEdge?: 'above' | 'below' | null
}): React.JSX.Element {
  const activeChatThreadId = useAppStore((s) => s.activeChatThreadId)
  const setActiveChatThread = useAppStore((s) => s.setActiveChatThread)
  const updateChatThread = useAppStore((s) => s.updateChatThread)
  const deleteChatThread = useAppStore((s) => s.deleteChatThread)
  const agentStatus = useAppStore((s) => {
    const session = s.chatThreadSessions[thread.id]
    return session ? s.agentStatusByPaneKey[session.paneKey] : undefined
  })
  const hasPendingApproval = useAppStore(
    (s) => (s.chatThreadPermissionRequests[thread.id]?.length ?? 0) > 0
  )
  const hasFullAccess = useAppStore(
    (s) =>
      s.settings?.nativeChatPermissionMode === 'full' || s.chatThreadFullAccess[thread.id] === true
  )
  const status = resolveChatThreadStatus({
    agentState: agentStatus?.state,
    hasPendingApproval,
    hasUnseenCompletion: hasUnseenCompletion(thread),
    hasFullAccess
  })
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(thread.title)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [renaming])

  const commitRename = (): void => {
    const title = draftTitle.trim()
    setRenaming(false)
    if (title && title !== thread.title) {
      void updateChatThread(thread.id, { title })
    }
  }

  if (renaming) {
    return (
      <li className="flex items-center px-0.5 py-0.5">
        <Input
          ref={inputRef}
          value={draftTitle}
          className="h-7 text-sm"
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitRename()
            }
            if (event.key === 'Escape') {
              setDraftTitle(thread.title)
              setRenaming(false)
            }
          }}
        />
      </li>
    )
  }

  return (
    // The menu button overlays the row's right edge so the hover/active surface
    // spans the full sidebar width instead of stopping short of the dots.
    <li className={cn('group/thread relative', isDragging && 'opacity-50')} {...dragProps}>
      {dropEdge ? (
        <span
          className={cn(
            'pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-ring',
            dropEdge === 'above' ? '-top-px' : '-bottom-px'
          )}
        />
      ) : null}
      <button
        type="button"
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-left text-[13px] transition-[padding]',
          'group-hover/thread:pr-8',
          thread.id === activeChatThreadId
            ? 'bg-accent text-accent-foreground'
            : status === 'idle'
              ? // Recede (T3): nothing here needs a human, so the row rests dim.
                'font-normal text-muted-foreground/75 transition-colors hover:bg-muted/60 hover:text-foreground/90'
              : 'text-foreground/90 hover:bg-muted/60'
        )}
        onClick={() => setActiveChatThread(thread.id)}
      >
        {thread.activeCollabTask ? (
          <ActiveCollabIcon className="size-3 shrink-0 text-muted-foreground/60" />
        ) : null}
        <span className="min-w-0 flex-1 truncate">
          {isChatWorkspaceBriefTitle(thread.title)
            ? deriveChatThreadTitle(thread.title)
            : thread.title}
        </span>
        <ThreadStatusLabel status={status} workingSince={agentStatus?.stateStartedAt} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover/thread:opacity-100 data-[state=open]:opacity-100"
            aria-label={translate('auto.components.chat.sidebar.threadMenu', 'Chat menu')}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setDraftTitle(thread.title)
              setRenaming(true)
            }}
          >
            {translate('auto.components.chat.sidebar.renameThread', 'Rename')}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => void deleteChatThread(thread.id)}>
            {translate('auto.components.chat.sidebar.deleteThread', 'Delete chat')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
