// Ported from the muster-bots fork (src/components/SidebarThreadRow.tsx), Apache-2.0.
// One thread row in the chat sidebar: title, status markers, and the row menu.
// Rename edits inline so the list keeps its place.
//
// Archive hides the thread from the main list; the sidebar's Archived section
// is what brings it back. Adding the one without the other would make archive a
// one-way trip.

import { ROW_HOVER } from '@/components/ui/hover-fill-classes'
import { Loader2, MoreHorizontal, Pin, PinOff } from 'lucide-react'
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
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import {
  canMarkChatThreadUnread,
  hasUnseenCompletion,
  nextVisitStamp,
  resolveChatThreadStatus,
  unreadVisitStamp,
  type ChatThreadStatus
} from './chat-thread-status'
import { regenerateChatThreadTitle } from './chat-thread-auto-title'
import { useChatThreadContentMatch } from './use-chat-thread-content-search'
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu'

/** Right-hand markers: pin, then one status (approval label, working spinner or unread dot). */
function ThreadRowMarkers({
  status,
  pinned
}: {
  status: ChatThreadStatus
  pinned: boolean
}): React.JSX.Element | null {
  const marker =
    status === 'approval' ? (
      <span className="shrink-0 text-[11px] font-medium text-status-attention">
        {translate('auto.components.chat.sidebar.statusApproval', 'Approval')}
      </span>
    ) : status === 'working' ? (
      // STYLEGUIDE: working shares the attention hue; the spinner tells it apart.
      <Loader2
        role="img"
        aria-label={translate('auto.components.chat.sidebar.statusWorking', 'Working')}
        className="size-3 shrink-0 animate-spin text-status-attention motion-reduce:animate-none"
      />
    ) : status === 'unread-done' ? (
      <span
        role="img"
        aria-label={translate('auto.components.chat.sidebar.statusDone', 'Done')}
        className="size-1.5 shrink-0 rounded-full bg-chat-accent"
      />
    ) : null
  if (!pinned && !marker) {
    return null
  }
  return (
    <span className="flex shrink-0 items-center gap-2">
      {pinned ? (
        <Pin
          role="img"
          aria-label={translate('auto.components.chat.sidebar.pinnedThread', 'Pinned')}
          className="size-3 shrink-0 text-chat-ink-secondary"
        />
      ) : null}
      {marker}
    </span>
  )
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
  dropEdge = null,
  indent = false
}: {
  thread: ChatThread
  dragProps?: ChatThreadRowDragProps
  isDragging?: boolean
  /** Insert-position indicator while another row is dragged over this one. */
  dropEdge?: 'above' | 'below' | null
  /** Lines the title up under its workspace name while the fill stays full width. */
  indent?: boolean
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
  const current = thread.id === activeChatThreadId
  const unread = hasUnseenCompletion(thread)
  const canMarkUnread = canMarkChatThreadUnread(thread)
  const status = resolveChatThreadStatus({
    agentState: agentStatus?.state,
    hasPendingApproval,
    hasUnseenCompletion: unread,
    hasFullAccess
  })
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(thread.title)
  const contentMatch = useChatThreadContentMatch(thread.id)
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
      <li className="flex items-center">
        <Input
          ref={inputRef}
          value={draftTitle}
          className="h-8 text-[13px] md:text-[13px]"
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
        aria-current={current ? 'page' : undefined}
        data-current={current ? 'true' : undefined}
        className={cn(
          'flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[13px] font-medium',
          'transition-[padding,background-color,color] duration-150 ease-chat group-hover/thread:pr-8',
          indent ? 'pl-[26px]' : 'pl-2',
          current
            ? 'bg-secondary font-semibold text-foreground'
            : cn('text-chat-ink-secondary hover:text-foreground', ROW_HOVER)
        )}
        onClick={() => setActiveChatThread(thread.id)}
      >
        {thread.activeCollabTask ? (
          <ActiveCollabIcon className="size-3 shrink-0 text-chat-ink-tertiary" />
        ) : null}
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              'truncate',
              unread && 'font-semibold text-foreground',
              thread.archived === true && !current && 'text-chat-ink-tertiary'
            )}
          >
            {isChatWorkspaceBriefTitle(thread.title)
              ? deriveChatThreadTitle(thread.title)
              : thread.title}
          </span>
          {contentMatch ? (
            <span className="truncate text-[11px] font-normal text-chat-ink-tertiary">
              {contentMatch.snippet}
            </span>
          ) : null}
        </span>
        <ThreadRowMarkers status={status} pinned={thread.pinned === true} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute right-1 top-1/2 -translate-y-1/2 text-chat-ink-secondary opacity-0 transition-opacity group-hover/thread:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
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
          <DropdownMenuItem
            onSelect={() => void updateChatThread(thread.id, { pinned: thread.pinned !== true })}
          >
            {thread.pinned === true ? (
              <PinOff className="size-3.5" />
            ) : (
              <Pin className="size-3.5" />
            )}
            {thread.pinned === true
              ? translate('auto.components.chat.sidebar.unpinThread', 'Unpin')
              : translate('auto.components.chat.sidebar.pinThread', 'Pin to top')}
          </DropdownMenuItem>
          {unread ? (
            <DropdownMenuItem
              onSelect={() =>
                void updateChatThread(thread.id, {
                  lastVisitedAt: nextVisitStamp(Date.now(), thread.lastCompletedAt)
                })
              }
            >
              {translate('auto.components.chat.sidebar.markRead', 'Mark as read')}
            </DropdownMenuItem>
          ) : canMarkUnread ? (
            <DropdownMenuItem
              onSelect={() =>
                void updateChatThread(thread.id, {
                  lastVisitedAt: unreadVisitStamp(thread.lastCompletedAt as number)
                })
              }
            >
              {translate('auto.components.chat.sidebar.markUnread', 'Mark as unread')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => void regenerateChatThreadTitle(thread.id)}>
            {translate('auto.components.chat.sidebar.regenerateTitle', 'Regenerate title')}
          </DropdownMenuItem>
          <DropdownMenuCheckboxItem
            checked={thread.showTechnicalDetails === true}
            onCheckedChange={(checked) =>
              void updateChatThread(thread.id, { showTechnicalDetails: checked === true })
            }
          >
            {translate(
              'components.chat-mode.thread.showTechnicalDetails',
              'Show technical details'
            )}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              void updateChatThread(thread.id, { archived: thread.archived !== true })
            }
          >
            {thread.archived === true
              ? translate('auto.components.chat.sidebar.unarchiveThread', 'Unarchive')
              : translate('auto.components.chat.sidebar.archiveThread', 'Archive')}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => void deleteChatThread(thread.id)}>
            {translate('auto.components.chat.sidebar.deleteThread', 'Delete chat')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
