import { createContext, useContext } from 'react'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'

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
}

export const ChatThreadContext = createContext<ChatThreadContextValue>({
  threadId: '',
  cwd: null
})

export const useChatThreadContext = (): ChatThreadContextValue => useContext(ChatThreadContext)
