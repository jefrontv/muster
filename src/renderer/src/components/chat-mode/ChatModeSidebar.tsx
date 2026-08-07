// Chat mode's own sidebar: a search bar over everything, ungrouped standalone chats,
// then workspaces with their threads. Selection state lives in the chat slice.

import {
  ListTodo,
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
import { useAppStore } from '@/store'
import { ChatModeToggle } from './ChatModeToggle'
import { ChatThreadRow } from './ChatThreadRow'
import { ChatWorkspaceCreateDialog } from './ChatWorkspaceCreateDialog'

function matchesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query)
}

function visibleThreads(threads: ChatThread[], query: string): ChatThread[] {
  // Creation order stays static while agents work (T3 pattern) — a list that
  // reorders on every activity tick steals the row out from under the pointer.
  const sorted = threads
    .filter((t) => t.archived !== true)
    .sort((a, b) => a.createdAt - b.createdAt)
  return query ? sorted.filter((t) => matchesQuery(t.title, query)) : sorted
}

function StandaloneChatsSection({ query }: { query: string }): React.JSX.Element | null {
  const threads = useAppStore((s) => s.chatThreads)
  const createChatThread = useAppStore((s) => s.createChatThread)
  const rows = visibleThreads(
    threads.filter((t) => t.workspaceId === null),
    query
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
          className="opacity-0 transition-opacity group-hover:opacity-100"
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
        <ul className="space-y-px">
          {rows.map((thread) => (
            <ChatThreadRow key={thread.id} thread={thread} />
          ))}
        </ul>
      )}
    </section>
  )
}

function WorkspaceSection({
  workspace,
  query,
  onEdit
}: {
  workspace: ChatWorkspace
  query: string
  onEdit: (workspace: ChatWorkspace) => void
}): React.JSX.Element | null {
  const threads = useAppStore((s) => s.chatThreads)
  const createChatThread = useAppStore((s) => s.createChatThread)
  const deleteChatWorkspace = useAppStore((s) => s.deleteChatWorkspace)
  const workspaceMatches = query ? matchesQuery(workspace.name, query) : true
  // A workspace-name match keeps all its threads; otherwise the query filters them.
  const rows = visibleThreads(
    threads.filter((t) => t.workspaceId === workspace.id),
    workspaceMatches ? '' : query
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
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-0 transition-opacity group-hover:opacity-100"
          aria-label={translate('auto.components.chat.sidebar.newThread', 'New chat')}
          onClick={() => void createChatThread(workspace.id)}
        >
          <MessageSquarePlus className="size-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 transition-opacity group-hover:opacity-100"
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
        <ul className="space-y-px">
          {rows.map((thread) => (
            <ChatThreadRow key={thread.id} thread={thread} />
          ))}
        </ul>
      )}
    </section>
  )
}

export function ChatModeSidebar(): React.JSX.Element {
  const workspaces = useAppStore((s) => s.chatWorkspaces)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openTaskPage = useAppStore((s) => s.openTaskPage)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ChatWorkspace | undefined>(undefined)
  const [rawQuery, setRawQuery] = useState('')
  const query = rawQuery.trim().toLowerCase()

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex flex-col gap-3 p-3 pb-0">
        <ChatModeToggle />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={rawQuery}
            className="h-8 pl-7 text-sm"
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
        <StandaloneChatsSection query={query} />
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
            onEdit={(target) => {
              setEditing(target)
              setDialogOpen(true)
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1 border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => openTaskPage()}
        >
          <ListTodo className="size-3.5" />
          {translate('auto.components.chat.sidebar.tasks', 'Tasks')}
        </Button>
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
      <ChatWorkspaceCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        {...(editing ? { workspace: editing } : {})}
      />
    </aside>
  )
}
