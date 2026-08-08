// The Chat top-level surface: a slim titlebar (drag region + app name), its own
// sidebar beside the active thread's conversation. Owns chat-store hydration.

import type React from 'react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { nextVisitStamp } from './chat-thread-status'
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
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (!hydrated) {
      void hydrateChatMode()
    }
  }, [hydrated, hydrateChatMode])

  // One window-wide stream-event subscription: threads keep receiving deltas
  // and lifecycle updates while another thread (or the Tasks page) is focused.
  // Safety timers bound how long a sealed preview can outlive its turn if the
  // transcript never catches up (interrupt, decode gap).
  const sealClearTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const timers = sealClearTimersRef.current
    const cancelSealClear = (threadId: string): void => {
      const timer = timers.get(threadId)
      if (timer) {
        clearTimeout(timer)
        timers.delete(threadId)
      }
    }
    const scheduleSealClear = (threadId: string): void => {
      cancelSealClear(threadId)
      timers.set(
        threadId,
        setTimeout(() => {
          timers.delete(threadId)
          useAppStore.getState().clearChatThreadStreamingText(threadId)
        }, 6_000)
      )
    }
    const unsubscribe = window.api.chatThreadStream.onEvent((event) => {
      const store = useAppStore.getState()
      switch (event.kind) {
        case 'init': {
          const thread = store.chatThreads.find((t) => t.id === event.threadId)
          if (thread && thread.claudeSessionId !== event.sessionId) {
            void store.updateChatThread(event.threadId, {
              claudeSessionId: event.sessionId,
              lastActivityAt: Date.now()
            })
          }
          break
        }
        case 'delta':
          cancelSealClear(event.threadId)
          store.appendChatThreadStreamingText(event.threadId, event.text)
          break
        // Sealing (not clearing) keeps the preview until the transcript renders
        // the finished message — an eager clear flashes an empty gap first.
        case 'message-final':
          store.sealChatThreadStreamingText(event.threadId)
          scheduleSealClear(event.threadId)
          void store.updateChatThread(event.threadId, { lastActivityAt: Date.now() })
          break
        case 'turn-complete': {
          store.sealChatThreadStreamingText(event.threadId)
          scheduleSealClear(event.threadId)
          if (event.contextWindow !== undefined) {
            store.setChatThreadContextWindow(event.threadId, event.contextWindow)
          }
          const now = Date.now()
          // A completion the user is watching (thread active, window focused)
          // is read on arrival — it must not light the sidebar's unread "Done".
          const watched = store.activeChatThreadId === event.threadId && document.hasFocus()
          void store.updateChatThread(event.threadId, {
            lastActivityAt: now,
            lastCompletedAt: now,
            ...(event.contextWindow !== undefined ? { contextWindow: event.contextWindow } : {}),
            ...(watched ? { lastVisitedAt: now } : {})
          })
          break
        }
        case 'permission-request':
          // Full access + "Always allow this session" verdicts short-circuit the queue.
          if (
            store.chatThreadFullAccess[event.threadId] === true ||
            store.chatThreadSessionAllowedTools[event.threadId]?.includes(event.toolName)
          ) {
            store.respondChatThreadPermission(event.threadId, event.requestId, 'allow')
            break
          }
          store.addChatThreadPermissionRequest(event.threadId, {
            requestId: event.requestId,
            toolName: event.toolName,
            input: event.input
          })
          break
        case 'permission-cancel':
          store.removeChatThreadPermissionRequest(event.threadId, event.requestId)
          break
        case 'exit': {
          // Only unexpected deaths arrive here (intentional stops are silent);
          // dropping the session record flips ChatThreadView to its resume state.
          const session = store.chatThreadSessions[event.threadId]
          if (session) {
            store.clearAgentLaunchConfig(session.paneKey)
          }
          cancelSealClear(event.threadId)
          store.clearChatThreadStreamingText(event.threadId)
          store.clearChatThreadPermissionRequests(event.threadId)
          // Session-scoped "always allow" and full-access verdicts die with the session.
          store.clearChatThreadSessionAllowedTools(event.threadId)
          store.setChatThreadFullAccess(event.threadId, false)
          store.setChatThreadSession(event.threadId, null)
          break
        }
      }
    })
    return () => {
      unsubscribe()
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

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
          <ChatModeDraftHero onCreateWorkspace={() => setCreateOpen(true)} />
        )}
      </main>
      <ChatWorkspaceCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
