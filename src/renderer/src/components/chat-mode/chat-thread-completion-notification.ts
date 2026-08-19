// Tells the user when a chat turn finished while they were looking elsewhere.
//
// Why chat needs its own path: the existing agent-task-complete notification is
// driven from pty-connection, which only runs under TerminalPane. Chat mode
// renders NativeChatView and never mounts one, so chat threads have been
// finishing silently. This reuses the same notification source, so the settings
// toggle, sound and burst dedupe all behave identically — only the trigger is new.
//
// The delayed confirmation is lifted from t3code's awareness relay: it defers a
// "completed" signal and re-checks before emitting, so a session that merely
// booted to ready never fires a spurious "Done". Ours guards the same way
// against a turn that resumes work within the window.

import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { GlobalSettings } from '../../../../shared/types'

/**
 * How long to wait before confirming the turn really ended.
 *
 * Long enough that a turn continuing after a brief pause cancels the banner,
 * short enough that the notification still feels like a response to the finish.
 */
export const CHAT_COMPLETION_CONFIRM_MS = 5_000

export function isChatCompletionNotificationEnabled(
  settings: Pick<GlobalSettings, 'notifications'> | null
): boolean {
  const notifications = settings?.notifications
  return notifications?.enabled !== false && notifications?.agentTaskComplete !== false
}

/**
 * Whether a finished turn is worth interrupting the user for.
 *
 * A turn the user watched land needs no banner, and a failed turn already has
 * the error banner in the thread — a second, less specific alert adds nothing.
 */
export function shouldNotifyChatTurnComplete(args: {
  isError: boolean
  /** Thread was open in a focused window when the turn completed. */
  watched: boolean
  settings: Pick<GlobalSettings, 'notifications'> | null
}): boolean {
  return !args.isError && !args.watched && isChatCompletionNotificationEnabled(args.settings)
}

/** Work resumed inside the confirmation window, so the turn had not really ended. */
export function isChatCompletionStillSettled(entry: AgentStatusEntry | undefined): boolean {
  return entry?.state !== 'working'
}

export type ChatCompletionNotificationDeps = {
  /** Agent status for the thread's pane at confirmation time. */
  readAgentStatus: () => AgentStatusEntry | undefined
  dispatch: (args: { paneKey: string; title: string; dedupeKey: string }) => void
  setTimer: (callback: () => void, ms: number) => number
}

/**
 * Schedules the confirmed notification. Returns a cancel function so a new turn
 * on the same thread can retract a banner that has not fired yet.
 */
export function scheduleChatCompletionNotification(
  args: { threadId: string; paneKey: string; title: string },
  deps: ChatCompletionNotificationDeps
): () => void {
  let cancelled = false
  deps.setTimer(() => {
    if (cancelled || !isChatCompletionStillSettled(deps.readAgentStatus())) {
      return
    }
    deps.dispatch({
      paneKey: args.paneKey,
      title: args.title,
      // Per thread, not per worktree: chat threads have no worktree, and two
      // threads finishing together are two separate things to know about.
      dedupeKey: `chat-thread:${args.threadId}`
    })
  }, CHAT_COMPLETION_CONFIRM_MS)
  return () => {
    cancelled = true
  }
}
