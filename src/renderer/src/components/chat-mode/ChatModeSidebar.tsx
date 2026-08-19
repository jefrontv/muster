// Chat mode's own sidebar: a search bar over everything, workspaces with their
// threads first (standalone chats lead only when no workspace exists yet), then
// ungrouped chats in a height-capped fade-edge scroller, then a collapsed
// "Settled" shelf for long-quiet threads. Selection state lives in the chat slice.

import { List, Plus, Search, Settings as SettingsIcon } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import type { ChatWorkspace } from '../../../../shared/chat-mode-types'
import { translate } from '@/i18n/i18n'
import { CHAT_SIDEBAR_REGION_LABEL } from './chat-sidebar-hierarchy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  WORKTREE_SIDEBAR_RESIZE_HANDLE_CLASS_NAME,
  WORKTREE_SIDEBAR_RESIZE_HANDLE_LINE_CLASS_NAME
} from '@/components/sidebar/sidebar-resize-handle-style'
import { SetupGuideSidebarEntry } from '@/components/sidebar/SetupGuideSidebarEntry'
import { useContextualTour } from '@/components/contextual-tours/use-contextual-tour'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useSettledThreadIds } from './use-settled-chat-threads'
import { ChatModeToggle } from './ChatModeToggle'
import {
  SettledSection,
  StandaloneChatsSection,
  WorkspaceSection
} from './ChatSidebarThreadSections'
import { ChatWorkspaceCreateDialog } from './ChatWorkspaceCreateDialog'
import {
  isDueToday,
  isOverdue,
  useAssignedActiveCollabTasks
} from './use-active-collab-assigned-tasks'

const MIN_WIDTH = 220
const MAX_WIDTH = 500

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
  useContextualTour('chat-mode', true)
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
        <SetupGuideSidebarEntry variant="chat" />
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
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto scrollbar-sleek p-3">
        {/* With workspaces set up, they are the primary navigation — quick
            standalone chats move below them. Without any, chats lead. */}
        {workspaces.length === 0 ? (
          <StandaloneChatsSection query={query} settledIds={settledIds} />
        ) : null}
        <div
          className="flex items-center justify-between px-1"
          data-contextual-tour-target="chat-workspaces"
        >
          <h2 className={CHAT_SIDEBAR_REGION_LABEL}>
            {translate('auto.components.chat.sidebar.workspaces', 'Workspaces')}
          </h2>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={translate('auto.components.chat.sidebar.newWorkspace', 'New workspace')}
            onClick={() => {
              useAppStore.getState().setChatWorkspaceCreateOpen(true)
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
        {workspaces.length > 0 ? (
          <StandaloneChatsSection query={query} settledIds={settledIds} />
        ) : null}
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
