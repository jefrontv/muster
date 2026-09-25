// When a chat thread counts as seen, and the banner for a thread blocked on the user.

import type { AppState } from '../../store/types'
import { isAskUserQuestionTool } from '../../../../shared/agent-question-answered-intent'
import {
  deriveChatThreadTitle,
  isChatWorkspaceBriefTitle
} from '../../../../shared/chat-workspace-site-info'

type ChatWatchState = Pick<AppState, 'activeView' | 'chatTasksOpen' | 'activeChatThreadId'>

/** Seen means the Chat tab is showing this thread in a focused window; selected alone is not enough. */
export function isChatThreadWatched(
  state: ChatWatchState,
  threadId: string,
  windowFocused: boolean
): boolean {
  return (
    windowFocused &&
    state.activeView === 'chat' &&
    !state.chatTasksOpen &&
    state.activeChatThreadId === threadId
  )
}

/** The name the sidebar shows; a brief-shaped title is the workspace prompt, not the thread's topic. */
export function chatThreadDisplayTitle(title: string | undefined): string {
  if (!title) {
    return 'Chat'
  }
  return isChatWorkspaceBriefTitle(title) ? deriveChatThreadTitle(title) : title
}

export function describeChatThreadInputRequest(toolName: string): string {
  return isAskUserQuestionTool(toolName)
    ? 'Claude asked you a question.'
    : `Approve ${toolName} to continue.`
}

export function shouldNotifyChatThreadNeedsInput(args: {
  watched: boolean
  settings: Pick<AppState, 'settings'>['settings']
}): boolean {
  const notifications = args.settings?.notifications
  return (
    !args.watched && notifications?.enabled !== false && notifications?.agentNeedsInput !== false
  )
}
