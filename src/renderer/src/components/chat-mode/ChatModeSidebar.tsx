// Chat mode's own sidebar: a search bar over everything, ungrouped standalone chats,
// workspaces with their threads, then a collapsed "Settled" shelf for long-quiet
// threads. Selection state lives in the chat slice.

import {
  ChevronRight,
  List,
  MessageSquarePlus,
  MoreHorizontal,
  Plus,
  Search,
  Settings as SettingsIcon
} from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import type { ChatThread, ChatWorkspace } from '../../../../shared/chat-mode-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { normalizeRepoBadgeColor } from '../../../../shared/repo-badge-color'
import { RepoIconGlyph } from '@/components/repo/repo-icon'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import {
  WORKTREE_SIDEBAR_RESIZE_HANDLE_CLASS_NAME,
  WORKTREE_SIDEBAR_RESIZE_HANDLE_LINE_CLASS_NAME
} from '@/components/sidebar/sidebar-resize-handle-style'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { CHAT_SETTLED_SHELF_MAX_ROWS } from './chat-thread-status'
import { useSettledThreadIds } from './use-settled-chat-threads'
import { ChatModeToggle } from './ChatModeToggle'
import { sortChatThreads } from './chat-thread-ordering'
import { ChatThreadDragList } from './ChatThreadDragList'
import { ChatThreadRow } from './ChatThreadRow'
import { ChatWorkspaceCreateDialog } from './ChatWorkspaceCreateDialog'
import {
  isDueToday,
  isOverdue,
  useAssignedActiveCollabTasks
} from './use-active-collab-assigned-tasks'

const MIN_WIDTH = 220
const MAX_WIDTH = 500

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

function SettledSection({
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
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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

function StandaloneChatsSection({
  query,
  settledIds
}: {
  query: string
  settledIds: Set<string>
}): React.JSX.Element | null {
  const threads = useAppStore((s) => s.chatThreads)
  const createChatThread = useAppStore((s) => s.createChatThread)
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
        <h3 className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {translate('auto.components.chat.sidebar.chats', 'Chats')}
        </h3>
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
        <ChatThreadDragList threads={rows} />
      )}
    </section>
  )
}

function WorkspaceSection({
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

  return (
    <section className="space-y-0.5">
      <div className="group flex items-center gap-1.5 px-1">
        <RepoIconGlyph
          repoIcon={workspace.icon}
          className="size-4 shrink-0"
          color={normalizeRepoBadgeColor(workspace.color) ?? undefined}
        />
        <h3 className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {workspace.name}
        </h3>
        {workspace.activeCollabProject ? (
          <span title={workspace.activeCollabProject.name} className="shrink-0">
            <ActiveCollabIcon className="size-3 text-muted-foreground/70" />
          </span>
        ) : null}
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
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => void deleteChatWorkspace(workspace.id)}
            >
              {translate('auto.components.chat.sidebar.deleteWorkspace', 'Delete workspace')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={translate('auto.components.chat.sidebar.newThread', 'New chat')}
          onClick={() => void createChatThread(workspace.id)}
        >
          <MessageSquarePlus className="size-3.5" />
        </Button>
      </div>
      {rows.length === 0 ? (
        <button
          type="button"
          className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60"
          onClick={() => void createChatThread(workspace.id)}
        >
          {translate('auto.components.chat.sidebar.startFirstChat', 'Start a chat…')}
        </button>
      ) : (
        <ChatThreadDragList threads={rows} />
      )}
    </section>
  )
}

export function ChatModeSidebar(): React.JSX.Element {
  const workspaces = useAppStore((s) => s.chatWorkspaces)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openTaskPage = useAppStore((s) => s.openTaskPage)
  const tasksOpen = useAppStore((s) => s.chatTasksOpen)
  // Why the shared width: Chat and Code are two faces of one window, so a
  // resize in either must survive the switch — separate widths made the sidebar
  // jump on every toggle.
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ChatWorkspace | undefined>(undefined)
  const [rawQuery, setRawQuery] = useState('')
  const query = rawQuery.trim().toLowerCase()
  const settledIds = useSettledThreadIds()
  const assignedTasks = useAssignedActiveCollabTasks()
  const now = Date.now()
  const overdueCount = (assignedTasks ?? []).filter((t) => isOverdue(t, now)).length
  const dueCount = overdueCount + (assignedTasks ?? []).filter((t) => isDueToday(t, now)).length
  const { containerRef, onResizeStart, isResizing } = useSidebarResize<HTMLElement>({
    isOpen: true,
    width: sidebarWidth,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    deltaSign: 1,
    setWidth: setSidebarWidth
  })

  return (
    <aside
      ref={containerRef}
      className="relative flex h-full shrink-0 flex-col border-r border-border bg-sidebar"
    >
      <div className="flex flex-col gap-3 p-3 pb-0">
        <ChatModeToggle mode="chat" />
        <button
          type="button"
          aria-current={tasksOpen ? 'page' : undefined}
          className={cn(
            // Mirrors the code sidebar's Tasks row so the two views read as one app.
            'group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-medium tracking-tight transition-colors',
            tasksOpen
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-muted/60'
          )}
          onClick={() => openTaskPage()}
        >
          <List
            className={cn('size-4 shrink-0', !tasksOpen && 'text-muted-foreground/50')}
            strokeWidth={tasksOpen ? 2.25 : 1.75}
          />
          <span className="flex-1">{translate('auto.components.chat.sidebar.tasks', 'Tasks')}</span>
          {dueCount > 0 ? (
            <span
              title={translate(
                'auto.components.chat.sidebar.tasksDue',
                'Tasks due today or overdue'
              )}
              className={cn(
                'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums',
                overdueCount > 0
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {dueCount}
            </span>
          ) : null}
        </button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={rawQuery}
            className="h-8 border-transparent bg-muted/50 pl-7 text-sm shadow-none transition-colors hover:bg-muted/70 focus-visible:bg-background"
            placeholder={translate('auto.components.chat.sidebar.searchPlaceholder', 'Search…')}
            aria-label={translate(
              'auto.components.chat.sidebar.searchLabel',
              'Search chats and workspaces'
            )}
            onChange={(event) => setRawQuery(event.target.value)}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-sleek p-3">
        <StandaloneChatsSection query={query} settledIds={settledIds} />
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {translate('auto.components.chat.sidebar.workspaces', 'Workspaces')}
          </h2>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={translate('auto.components.chat.sidebar.newWorkspace', 'New workspace')}
            onClick={() => {
              setEditing(undefined)
              setDialogOpen(true)
            }}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        {workspaces.map((workspace) => (
          <WorkspaceSection
            key={workspace.id}
            workspace={workspace}
            query={query}
            settledIds={settledIds}
            onEdit={(target) => {
              setEditing(target)
              setDialogOpen(true)
            }}
          />
        ))}
        <SettledSection query={query} settledIds={settledIds} />
      </div>
      <div className="flex items-center gap-1 border-t border-border p-2">
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={translate('auto.components.chat.sidebar.settings', 'Settings')}
          onClick={() => openSettingsPage()}
        >
          <SettingsIcon className="size-3.5" />
        </Button>
      </div>
      <div
        data-sidebar-resize-handle=""
        className={cn(WORKTREE_SIDEBAR_RESIZE_HANDLE_CLASS_NAME, isResizing && 'bg-ring/10')}
        onMouseDown={onResizeStart}
      >
        <div
          className={cn(WORKTREE_SIDEBAR_RESIZE_HANDLE_LINE_CLASS_NAME, isResizing && 'bg-ring')}
        />
      </div>
      <ChatWorkspaceCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        {...(editing ? { workspace: editing } : {})}
      />
    </aside>
  )
}
