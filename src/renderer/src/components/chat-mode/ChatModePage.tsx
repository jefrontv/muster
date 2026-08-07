// The Chat top-level surface: a slim titlebar (drag region + app name), its own
// sidebar beside the active thread's conversation. Owns chat-store hydration.

import type React from 'react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { ChatModeEmptyState } from './ChatModeEmptyState'
import { ChatModeSidebar } from './ChatModeSidebar'
import { ChatThreadView } from './ChatThreadView'
import { ChatWorkspaceCreateDialog } from './ChatWorkspaceCreateDialog'

const TaskPage = lazy(() => import('../TaskPage'))

export default function ChatModePage(): React.JSX.Element {
  const hydrated = useAppStore((s) => s.chatModeHydrated)
  const hydrateChatMode = useAppStore((s) => s.hydrateChatMode)
  const workspaces = useAppStore((s) => s.chatWorkspaces)
  const threads = useAppStore((s) => s.chatThreads)
  const activeChatThreadId = useAppStore((s) => s.activeChatThreadId)
  const tasksOpen = useAppStore((s) => s.chatTasksOpen)
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
    <div className="flex h-full min-h-0 bg-background">
      <ChatModeSidebar />
      <main className="min-w-0 flex-1">
        {tasksOpen ? (
          <Suspense fallback={null}>
            <TaskPage />
          </Suspense>
        ) : activeThread && (activeThread.workspaceId === null || activeWorkspace) ? (
          <ChatThreadView key={activeThread.id} thread={activeThread} workspace={activeWorkspace} />
        ) : (
          <ChatModeEmptyState
            hasWorkspaces={workspaces.length > 0}
            onCreateWorkspace={() => setCreateOpen(true)}
          />
        )}
      </main>
      <ChatWorkspaceCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
