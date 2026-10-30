// Ported from the muster-bots fork (src/components/ChatView.tsx bot bubble, formatted-reply.ts), Apache-2.0.
// One assistant reply: a chat line in a card, a document as prose, a table-bearing document wider.

import type React from 'react'
import { cn } from '@/lib/utils'
import { chatReplyShape, type ChatReplyShape } from './chat-reply-shape'
import { ChatConversationMarkdown } from './ChatConversationMarkdown'
import { CHAT_MESSAGE_ROW_CLASS } from './ChatMessageTray'

const SHAPE_CLASS: Record<ChatReplyShape, string> = {
  line: 'w-fit max-w-(--chat-reply-max) rounded-chat-reply bg-chat-reply px-4 py-2.5',
  prose: 'w-full max-w-[min(var(--chat-prose-max),var(--chat-card-max))] px-1',
  // The table takes the reply's full width; prose around it stays at reading width.
  table:
    'w-full max-w-(--chat-card-max) px-1 [&_.chat-conversation-markdown>:not([data-chat-table])]:max-w-(--chat-prose-max)'
}

/** One wrapper whatever the shape, so a streamed reply that grows a list restyles instead of remounting. */
export function ChatReplyBubble(props: {
  text: string
  streaming: boolean
  /** Message actions beside the reply. */
  tray?: React.ReactNode
}): React.JSX.Element {
  const shape = chatReplyShape(props.text)
  return (
    <div className={cn(CHAT_MESSAGE_ROW_CLASS, 'flex w-full items-center justify-start gap-1.5')}>
      <div data-chat-reply={shape} className={cn('min-w-0', SHAPE_CLASS[shape])}>
        <ChatConversationMarkdown text={props.text} streaming={props.streaming} />
      </div>
      {props.tray}
    </div>
  )
}
