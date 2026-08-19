// The window's single subscription to chat-mode stream events.
//
// This deliberately does NOT live in ChatModePage: that page is only mounted
// while Chat is the visible view, so a switch to Code or Settings used to tear
// the listener down. Permission requests arriving in that window were dropped
// outright — the CLI blocks on can_use_tool forever and the thread stalls on
// "Working" with nothing to answer. Installed once from the app root instead,
// threads keep streaming whatever the user is looking at.

import { useAppStore } from '../store'
import { generateChatThreadTitleAfterFirstTurn } from '../components/chat-mode/chat-thread-auto-title'
import {
  scheduleChatCompletionNotification,
  shouldNotifyChatTurnComplete
} from '../components/chat-mode/chat-thread-completion-notification'

/** How long a sealed streaming preview may outlive its turn when the transcript
 *  never catches up (interrupt, decode gap). */
const SEAL_CLEAR_MS = 6_000

/** The CLI reports some failures with no message at all. */
const FALLBACK_TURN_ERROR = 'The agent stopped with an error.'

/** Pending completion banners, so a new turn can retract one before it fires. */
const pendingCompletionNotifications = new Map<string, () => void>()

function cancelPendingCompletionNotification(threadId: string): void {
  pendingCompletionNotifications.get(threadId)?.()
  pendingCompletionNotifications.delete(threadId)
}

export function installChatThreadStreamEvents(): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

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
      }, SEAL_CLEAR_MS)
    )
  }

  // A reload loses the queued questions but not the blocked CLI waiting on them,
  // so re-read what main is still holding before listening for new ones.
  void window.api.chatThreadStream
    .pendingPermissions()
    .then((requests) => {
      const store = useAppStore.getState()
      for (const request of requests) {
        store.addChatThreadPermissionRequest(request.threadId, {
          requestId: request.requestId,
          toolName: request.toolName,
          input: request.input
        })
      }
    })
    .catch(() => undefined)

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
        // First token of a new turn retires the previous turn's failure, so a
        // stale banner cannot hang over a run that is going fine.
        store.setChatThreadLastError(event.threadId, null)
        cancelPendingCompletionNotification(event.threadId)
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
        // The stream's own result record is the authoritative end of the turn.
        // Hooks normally close the pane out, but a dropped Stop hook (or a turn
        // the CLI ended while a card was still open) leaves the pane stuck on
        // "Working" with nothing to correct it.
        const settlingPaneKey = store.chatThreadSessions[event.threadId]?.paneKey
        if (settlingPaneKey) {
          store.settleAgentStatusWorking(settlingPaneKey, now)
        }
        void generateChatThreadTitleAfterFirstTurn(event.threadId)
        // Main decodes the failure but nothing used to read it, so a failed
        // turn looked exactly like a successful one.
        store.setChatThreadLastError(
          event.threadId,
          event.isError ? (event.errorMessage ?? FALLBACK_TURN_ERROR) : null
        )
        // A completion the user is watching (thread active, window focused) is
        // read on arrival — it must not light the sidebar's unread "Done".
        const watched = store.activeChatThreadId === event.threadId && document.hasFocus()
        cancelPendingCompletionNotification(event.threadId)
        if (
          shouldNotifyChatTurnComplete({ isError: event.isError, watched, settings: store.settings })
        ) {
          const notifyPaneKey = store.chatThreadSessions[event.threadId]?.paneKey
          const thread = store.chatThreads.find((t) => t.id === event.threadId)
          if (notifyPaneKey) {
            pendingCompletionNotifications.set(
              event.threadId,
              scheduleChatCompletionNotification(
                {
                  threadId: event.threadId,
                  paneKey: notifyPaneKey,
                  title: thread?.title ?? 'Chat'
                },
                {
                  readAgentStatus: () =>
                    useAppStore.getState().agentStatusByPaneKey[notifyPaneKey],
                  setTimer: (callback, ms) => window.setTimeout(callback, ms),
                  dispatch: ({ paneKey, title, dedupeKey }) => {
                    pendingCompletionNotifications.delete(event.threadId)
                    void window.api.notifications
                      .dispatch({
                        source: 'agent-task-complete',
                        paneKey,
                        terminalTitle: title,
                        dedupeKey
                      })
                      .catch(() => undefined)
                  }
                }
              )
            )
          }
        }
        void store.updateChatThread(event.threadId, {
          lastActivityAt: now,
          // Why gated: lastCompletedAt is what turns the sidebar's "Done" pill
          // green, and a turn that failed is not done.
          ...(event.isError ? {} : { lastCompletedAt: now }),
          ...(event.contextWindow !== undefined ? { contextWindow: event.contextWindow } : {}),
          ...(watched ? { lastVisitedAt: now } : {})
        })
        break
      }
      case 'permission-request':
        // The full-access / session-allow verdict lives in the store action, so
        // this path and the reload replay cannot drift apart.
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
}
