// The Chat top-level surface: a slim titlebar (drag region + app name), its own
// sidebar beside the active thread's conversation. Owns chat-store hydration.

import type React from 'react'
import { lazy, Suspense, useEffect } from 'react'
import { useAppStore } from '@/store'
import { nextVisitStamp } from './chat-thread-status'
import { ChatConnectorConfirmDialog } from './ChatConnectorConfirmDialog'
import { ChatModeDraftHero } from './ChatModeDraftHero'
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
  const createOpen = useAppStore((s) => s.chatWorkspaceCreateOpen ?? false)
  const setCreateOpen = useAppStore((s) => s.setChatWorkspaceCreateOpen)

  useEffect(() => {
    if (!hydrated) {
      void hydrateChatMode()
    }
  }, [hydrated, hydrateChatMode])

  // Muster MCP tools mutate the chat store in main; re-pull and drop runtime
  // session records for threads the tools deleted (their exit is suppressed).
  useEffect(
    () =>
      window.api.chatMode.onExternalChange(() => {
        void useAppStore
          .getState()
          .hydrateChatMode()
          .then(() => {
            const s = useAppStore.getState()
            for (const threadId of Object.keys(s.chatThreadSessions)) {
              if (!s.chatThreads.some((t) => t.id === threadId)) {
                s.setChatThreadSession(threadId, null)
              }
            }
          })
      }),
    []
  )

  // Visiting = the thread is active in a focused window. Stamped on activation
  // and on window refocus so a completion read in place clears its unread mark.
  useEffect(() => {
    const stampVisited = (): void => {
      if (!document.hasFocus()) {
        return
      }
      const s = useAppStore.getState()
      const thread = s.chatThreads.find((t) => t.id === s.activeChatThreadId)
      if (!thread) {
        return
      }
      const stamp = nextVisitStamp(Date.now(), thread.lastCompletedAt)
      if (thread.lastVisitedAt !== undefined && thread.lastVisitedAt >= stamp) {
        return
      }
      void s.updateChatThread(thread.id, { lastVisitedAt: stamp })
    }
    stampVisited()
    window.addEventListener('focus', stampVisited)
    return () => window.removeEventListener('focus', stampVisited)
  }, [activeChatThreadId])

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
          <ChatModeDraftHero onCreateWorkspace={() => setCreateOpen?.(true)} />
        )}
      </main>
      <ChatWorkspaceCreateDialog open={createOpen} onOpenChange={(open) => setCreateOpen?.(open)} />
      <ChatConnectorConfirmDialog />
    </div>
  )
}
