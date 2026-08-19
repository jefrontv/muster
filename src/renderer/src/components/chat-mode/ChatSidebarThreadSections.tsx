// The chat sidebar's three thread groupings: standalone chats (height-capped,
// fade-edge scrolled, with a delete-all menu), per-workspace sections (each with
// its own clear-all), and the collapsed "Settled" shelf for long-quiet threads.

import { ChevronRight, MessageSquarePlus, MoreHorizontal } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import type { ChatThread, ChatWorkspace } from '../../../../shared/chat-mode-types'
import { chatWorkspaceProjects } from '../../../../shared/chat-workspace-site-info'
import { normalizeRepoBadgeColor } from '../../../../shared/repo-badge-color'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { RepoIconGlyph } from '@/components/repo/repo-icon'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import {
  CHAT_SIDEBAR_GROUP_LABEL,
  CHAT_SIDEBAR_GROUP_ROWS,
  CHAT_SIDEBAR_REGION_LABEL
} from './chat-sidebar-hierarchy'
import { CHAT_SETTLED_SHELF_MAX_ROWS } from './chat-thread-status'
import { sortChatThreads } from './chat-thread-ordering'
import { ChatClearAllDialog } from './ChatClearAllDialog'
import { ChatSidebarFadeScroller } from './ChatSidebarFadeScroller'
import { ChatThreadDragList } from './ChatThreadDragList'
import { ChatThreadRow } from './ChatThreadRow'

function matchesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query)
}

function visibleThreads(
  threads: ChatThread[],
  query: string,
  settledIds: Set<string>
): ChatThread[] {
  // Order is static while agents work (T3 pattern) — a list that reorders on
  // every activity tick steals the row out from under the pointer. New chats
  // land on top; drags persist an explicit position.
  const sorted = sortChatThreads(
    threads.filter((t) => t.archived !== true && !settledIds.has(t.id))
  )
  return query ? sorted.filter((t) => matchesQuery(t.title, query)) : sorted
}

export function SettledSection({
  query,
  settledIds
}: {
  query: string
  settledIds: Set<string>
}): React.JSX.Element | null {
  const threads = useAppStore((s) => s.chatThreads)
  const [expanded, setExpanded] = useState(false)
  const settled = threads
    .filter((t) => settledIds.has(t.id) && (!query || matchesQuery(t.title, query)))
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
  // Count reflects everything settled; the expanded list caps (no paging yet).
  const rows = settled.slice(0, CHAT_SETTLED_SHELF_MAX_ROWS)
  if (rows.length === 0) {
    return null
  }
  return (
    <section className="space-y-0.5">
      <button
        type="button"
        aria-expanded={expanded}
        className="group flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-left hover:bg-muted/60"
        onClick={() => setExpanded((open) => !open)}
      >
        <ChevronRight
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90'
          )}
        />
        <span className={CHAT_SIDEBAR_REGION_LABEL}>
          {translate('auto.components.chat.sidebar.settled', 'Settled')} · {settled.length}
        </span>
      </button>
      {expanded ? (
        <ul className="space-y-px">
          {rows.map((thread) => (
            <ChatThreadRow key={thread.id} thread={thread} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

export function StandaloneChatsSection({
  query,
  settledIds
}: {
  query: string
  settledIds: Set<string>
}): React.JSX.Element | null {
  const threads = useAppStore((s) => s.chatThreads)
  const createChatThread = useAppStore((s) => s.createChatThread)
  const deleteChatThreadsInScope = useAppStore((s) => s.deleteChatThreadsInScope)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const standaloneCount = threads.filter((t) => t.workspaceId === null).length
  const rows = visibleThreads(
    threads.filter((t) => t.workspaceId === null),
    query,
    settledIds
  )
  if (query && rows.length === 0) {
    return null
  }
  return (
    <section className="space-y-0.5">
      <div className="group flex items-center gap-1.5 px-1">
        <h3 className={cn('min-w-0 flex-1 truncate', CHAT_SIDEBAR_REGION_LABEL)}>
          {translate('auto.components.chat.sidebar.chats', 'Chats')}
        </h3>
        {standaloneCount > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                aria-label={translate('auto.components.chat.sidebar.chatsMenu', 'Chats menu')}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingClear(true)}>
                {translate('auto.components.chat.sidebar.deleteAllChats', 'Delete all chats')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={translate('auto.components.chat.sidebar.newStandaloneChat', 'New chat')}
          onClick={() => void createChatThread(null)}
        >
          <MessageSquarePlus className="size-3.5" />
        </Button>
      </div>
      {rows.length === 0 ? (
        <button
          type="button"
          className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60"
          onClick={() => void createChatThread(null)}
        >
          {translate('auto.components.chat.sidebar.startQuickChat', 'Start a quick chat…')}
        </button>
      ) : (
        // Capped so a long chat history cannot crowd the workspaces around it;
        // the fade edges replace a scrollbar as the "more here" affordance.
        <ChatSidebarFadeScroller>
          <ChatThreadDragList threads={rows} />
        </ChatSidebarFadeScroller>
      )}
      <ChatClearAllDialog
        open={confirmingClear}
        count={standaloneCount}
        onCancel={() => setConfirmingClear(false)}
        onConfirm={() => {
          setConfirmingClear(false)
          void deleteChatThreadsInScope(null)
        }}
      />
    </section>
  )
}

export function WorkspaceSection({
  workspace,
  query,
  settledIds,
  onEdit
}: {
  workspace: ChatWorkspace
  query: string
  settledIds: Set<string>
  onEdit: (workspace: ChatWorkspace) => void
}): React.JSX.Element | null {
  const threads = useAppStore((s) => s.chatThreads)
  const createChatThread = useAppStore((s) => s.createChatThread)
  const deleteChatWorkspace = useAppStore((s) => s.deleteChatWorkspace)
  const deleteChatThreadsInScope = useAppStore((s) => s.deleteChatThreadsInScope)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const workspaceThreadCount = threads.filter((t) => t.workspaceId === workspace.id).length
  const workspaceMatches = query ? matchesQuery(workspace.name, query) : true
  // A workspace-name match keeps all its threads; otherwise the query filters them.
  const rows = visibleThreads(
    threads.filter((t) => t.workspaceId === workspace.id),
    workspaceMatches ? '' : query,
    settledIds
  )
  if (query && !workspaceMatches && rows.length === 0) {
    return null
  }
  const linkedProjects = chatWorkspaceProjects(workspace)

  return (
    <section className="space-y-1">
      <div className="group flex items-center gap-1.5 px-1">
        <RepoIconGlyph
          repoIcon={workspace.icon}
          className="size-4 shrink-0"
          color={normalizeRepoBadgeColor(workspace.color) ?? undefined}
        />
        <h3 className={CHAT_SIDEBAR_GROUP_LABEL}>{workspace.name}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              aria-label={translate('auto.components.chat.sidebar.workspaceMenu', 'Workspace menu')}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(workspace)}>
              {translate('auto.components.chat.sidebar.editWorkspace', 'Edit workspace')}
            </DropdownMenuItem>
            {workspaceThreadCount > 0 ? (
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingClear(true)}>
                {translate('auto.components.chat.sidebar.clearWorkspaceChats', 'Delete all chats')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => void deleteChatWorkspace(workspace.id)}
            >
              {translate('auto.components.chat.sidebar.deleteWorkspace', 'Delete workspace')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {linkedProjects.length > 0 ? (
          <span
            title={linkedProjects.map((project) => project.name).join(', ')}
            className="shrink-0"
          >
            <ActiveCollabIcon className="size-3 text-muted-foreground/70" />
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={translate('auto.components.chat.sidebar.newThread', 'New chat')}
          onClick={() => void createChatThread(workspace.id)}
        >
          <MessageSquarePlus className="size-3.5" />
        </Button>
      </div>
      <div className={CHAT_SIDEBAR_GROUP_ROWS}>
        {rows.length === 0 ? (
          <button
            type="button"
            className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60"
            onClick={() => void createChatThread(workspace.id)}
          >
            {translate('auto.components.chat.sidebar.startFirstChat', 'Start a chat…')}
          </button>
        ) : (
          // Same cap as standalone chats: one busy workspace must not push the
          // rest of the sidebar out of view.
          <ChatSidebarFadeScroller>
            <ChatThreadDragList threads={rows} />
          </ChatSidebarFadeScroller>
        )}
      </div>
      <ChatClearAllDialog
        open={confirmingClear}
        count={workspaceThreadCount}
        workspaceName={workspace.name}
        onCancel={() => setConfirmingClear(false)}
        onConfirm={() => {
          setConfirmingClear(false)
          void deleteChatThreadsInScope(workspace.id)
        }}
      />
    </section>
  )
}
