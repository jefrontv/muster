// The Chat top-level surface: a slim titlebar (drag region + app name), its own
// sidebar beside the active thread's conversation. Owns chat-store hydration.

import type React from 'react'
import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { ChatModeEmptyState } from './ChatModeEmptyState'
import { ChatModeSidebar } from './ChatModeSidebar'
import { ChatThreadView } from './ChatThreadView'
import { ChatWorkspaceCreateDialog } from './ChatWorkspaceCreateDialog'

export default function ChatModePage(): React.JSX.Element {
  const hydrated = useAppStore((s) => s.chatModeHydrated)
  const hydrateChatMode = useAppStore((s) => s.hydrateChatMode)
  const workspaces = useAppStore((s) => s.chatWorkspaces)
  const threads = useAppStore((s) => s.chatThreads)
  const activeChatThreadId = useAppStore((s) => s.activeChatThreadId)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (!hydrated) {
      void hydrateChatMode()
    }
  }, [hydrated, hydrateChatMode])

  const activeThread = threads.find((t) => t.id === activeChatThreadId) ?? null
  const activeWorkspace =
    activeThread && activeThread.workspaceId !== null
      ? (workspaces.find((w) => w.id === activeThread.workspaceId) ?? null)
      : null

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Full-page views hide the worktree titlebar strip, so Chat draws its own:
          window drag region, traffic-light clearance, and the app name. */}
      {/* pl clears the macOS traffic lights so the name sits beside them, matching Code view. */}
      <div className="titlebar pl-20">
        <span className="text-sm font-semibold text-foreground select-none">Muster</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <ChatModeSidebar />
        <main className="min-w-0 flex-1">
          {activeThread && (activeThread.workspaceId === null || activeWorkspace) ? (
            <ChatThreadView
              key={activeThread.id}
              thread={activeThread}
              workspace={activeWorkspace}
            />
          ) : (
            <ChatModeEmptyState
              hasWorkspaces={workspaces.length > 0}
              onCreateWorkspace={() => setCreateOpen(true)}
            />
          )}
        </main>
      </div>
      <ChatWorkspaceCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
