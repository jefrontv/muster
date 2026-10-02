// Starts a chat thread's CLI process on demand (first send, Resume, composer
// prewarm) instead of on view, and keeps at most a few idle ones alive. One
// in-flight launch per thread, so a prewarm and a send never race two children.

import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ChatThreadSession } from '@/store/slices/chat-mode'
import { ChatThreadFolderMissingError } from './chat-thread-folder-missing'
import { launchChatThreadSession } from './chat-thread-session-launch'
import { selectChatThreadSessionsToStop } from './chat-thread-session-cap'

const inFlight = new Map<string, Promise<ChatThreadSession | null>>()

/** Resolves to the live session, or null when it could not start (the reason lands in the store). */
export function ensureChatThreadSession(threadId: string): Promise<ChatThreadSession | null> {
  const store = useAppStore.getState()
  const existing = store.chatThreadSessions[threadId]
  if (existing) {
    store.touchChatThreadSession(threadId)
    return Promise.resolve(existing)
  }
  const pending = inFlight.get(threadId)
  if (pending) {
    return pending
  }
  const launch = launchForThread(threadId).finally(() => inFlight.delete(threadId))
  inFlight.set(threadId, launch)
  return launch
}

async function launchForThread(threadId: string): Promise<ChatThreadSession | null> {
  const store = useAppStore.getState()
  const thread = store.chatThreads.find((t) => t.id === threadId)
  const workspace =
    thread?.workspaceId != null
      ? (store.chatWorkspaces.find((w) => w.id === thread.workspaceId) ?? null)
      : null
  if (!thread || (thread.workspaceId !== null && !workspace)) {
    return null
  }
  store.setChatThreadLaunching(threadId, true)
  store.setChatThreadSessionEnd(threadId, null)
  // A retry starts clean; the previous death's stderr must not outlive it.
  store.setChatThreadLastError(threadId, null)
  try {
    const result = await launchChatThreadSession({ thread, workspace })
    const latest = useAppStore.getState()
    // Deleted mid-launch: main already stopped the child, so don't record a session for it.
    if (!latest.chatThreads.some((t) => t.id === threadId)) {
      return null
    }
    if (!result) {
      latest.setChatThreadSessionEnd(threadId, {
        failed: true,
        message: translate(
          'auto.components.chat.thread.noLaunchPlan',
          'Could not build a launch command for this agent.'
        )
      })
      return null
    }
    latest.setChatThreadSession(threadId, result)
    latest.touchChatThreadSession(threadId)
    enforceChatThreadIdleSessionCap()
    return result
  } catch (error) {
    useAppStore.getState().setChatThreadSessionEnd(threadId, {
      failed: true,
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof ChatThreadFolderMissingError ? { missingFolder: error.folder } : {})
    })
    return null
  } finally {
    useAppStore.getState().setChatThreadLaunching(threadId, false)
  }
}

/** Quietly stops one thread's process; history stays and the next send relaunches. */
export function stopIdleChatThreadSession(threadId: string): void {
  const store = useAppStore.getState()
  const session = store.chatThreadSessions[threadId]
  if (!session) {
    return
  }
  void window.api.chatThreadStream.stop(threadId).catch(() => undefined)
  store.clearAgentLaunchConfig(session.paneKey)
  store.settleAgentStatusWorking(session.paneKey, Date.now())
  store.clearChatThreadStreamingText(threadId)
  store.setChatThreadSession(threadId, null)
}

export function enforceChatThreadIdleSessionCap(): void {
  const store = useAppStore.getState()
  const sessions = Object.entries(store.chatThreadSessions).map(([threadId, session]) => ({
    threadId,
    touchedAt: store.chatThreadSessionTouchedAt[threadId] ?? 0,
    busy:
      store.agentStatusByPaneKey[session.paneKey]?.state === 'working' ||
      (store.chatThreadPermissionRequests[threadId]?.length ?? 0) > 0 ||
      store.chatThreadStreamingText[threadId]?.sealed === false ||
      threadId in store.chatThreadFirstMessage
  }))
  const keep = new Set(store.activeChatThreadId ? [store.activeChatThreadId] : [])
  for (const threadId of selectChatThreadSessionsToStop({ sessions, keep })) {
    stopIdleChatThreadSession(threadId)
  }
}
