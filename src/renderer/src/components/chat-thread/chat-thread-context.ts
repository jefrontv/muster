import { createContext, useContext } from 'react'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'

export type ChatThreadContextValue = {
  threadId: string
  /** The chat's folder; tool rows show paths relative to it. */
  cwd: string | null
  onLinkClick?: CommentMarkdownLinkClickHandler
  /** Resends a failed turn's prompt. */
  onRetry?: (text: string) => void
}

export const ChatThreadContext = createContext<ChatThreadContextValue>({
  threadId: '',
  cwd: null
})

export const useChatThreadContext = (): ChatThreadContextValue => useContext(ChatThreadContext)
