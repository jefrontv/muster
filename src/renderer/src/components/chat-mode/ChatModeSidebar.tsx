// Chat mode's own sidebar: workspaces with their threads, plus create affordances.
// Selection state lives in the chat slice; this renders it.

import { MessageSquarePlus, MoreHorizontal, Plus } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import type { ChatWorkspace } from '../../../../shared/chat-mode-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { normalizeRepoBadgeColor } from '../../../../shared/repo-badge-color'
import { RepoIconGlyph } from '@/components/repo/repo-icon'
import { useAppStore } from '@/store'
import { ChatModeToggle } from './ChatModeToggle'
import { ChatWorkspaceCreateDialog } from './ChatWorkspaceCreateDialog'

function WorkspaceSection({
  workspace,
  onEdit
}: {
  workspace: ChatWorkspace
  onEdit: (workspace: ChatWorkspace) => void
}): React.JSX.Element {
  const threads = useAppStore((s) => s.chatThreads)
  const activeChatThreadId = useAppStore((s) => s.activeChatThreadId)
  const setActiveChatThread = useAppStore((s) => s.setActiveChatThread)
  const createChatThread = useAppStore((s) => s.createChatThread)
  const deleteChatWorkspace = useAppStore((s) => s.deleteChatWorkspace)
  const deleteChatThread = useAppStore((s) => s.deleteChatThread)
  const workspaceThreads = threads
    .filter((t) => t.workspaceId === workspace.id && t.archived !== true)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt)

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
      {workspaceThreads.length === 0 ? (
        <button
          type="button"
          className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60"
          onClick={() => void createChatThread(workspace.id)}
        >
          {translate('auto.components.chat.sidebar.startFirstChat', 'Start a chat…')}
        </button>
      ) : (
        <ul className="space-y-px">
          {workspaceThreads.map((thread) => (
            <li key={thread.id} className="group/thread flex items-center">
              <button
                type="button"
                className={cn(
                  'min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm',
                  thread.id === activeChatThreadId
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground/90 hover:bg-muted/60'
                )}
                onClick={() => setActiveChatThread(thread.id)}
              >
                {thread.title}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 transition-opacity group-hover/thread:opacity-100"
                    aria-label={translate('auto.components.chat.sidebar.threadMenu', 'Chat menu')}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => void deleteChatThread(thread.id)}
                  >
                    {translate('auto.components.chat.sidebar.deleteThread', 'Delete chat')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function ChatModeSidebar(): React.JSX.Element {
  const workspaces = useAppStore((s) => s.chatWorkspaces)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ChatWorkspace | undefined>(undefined)

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-3 border-r border-border bg-sidebar p-3">
      <ChatModeToggle />
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
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-sleek">
        {workspaces.map((workspace) => (
          <WorkspaceSection
            key={workspace.id}
            workspace={workspace}
            onEdit={(target) => {
              setEditing(target)
              setDialogOpen(true)
            }}
          />
        ))}
      </div>
      <ChatWorkspaceCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        {...(editing ? { workspace: editing } : {})}
      />
    </aside>
  )
}
