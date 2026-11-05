import { createContext, useContext } from 'react'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import type React from 'react'
import type {
  ChatAgentItem,
  ChatRosterAgent
} from '@/components/chat-conversation/chat-subagent-focus'

export type ChatThreadContextValue = {
  threadId: string
  /** The chat's folder; tool rows show paths relative to it. */
  cwd: string | null
  onLinkClick?: CommentMarkdownLinkClickHandler
  /** Resends a failed turn's prompt. */
  onRetry?: (text: string) => void
  /** Quotes a reply into the composer (Chat mode). */
  onQuote?: (text: string) => void
  /** Workspace reply style is conversational: replies show as a few short bubbles. */
  conversational?: boolean
  /** The visit stamp from before this open, when a turn finished unseen; drives the "New" line. */
  unreadSince?: number | null
  /** Draws a subagent's steps when they live outside this thread (the Code panel's sidechain files). */
  renderAgentSteps?: (agent: ChatAgentItem) => React.ReactNode
  /** Undo changes is offered; false where the thread has no engine CLI to rewind. */
  canUndo?: boolean
  /** Shows a subagent's own steps in place of the transcript (Chat mode). */
  openAgent?: (agentId: string) => void
  /** Same, from a roster row in the running-agents tab. */
  openRosterAgent?: (roster: readonly ChatRosterAgent[], target: ChatRosterAgent) => void
}

export const ChatThreadContext = createContext<ChatThreadContextValue>({
  threadId: '',
  cwd: null
})

export const useChatThreadContext = (): ChatThreadContextValue => useContext(ChatThreadContext)
