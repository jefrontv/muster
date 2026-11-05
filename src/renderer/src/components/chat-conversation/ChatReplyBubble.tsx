// Ported from the muster-bots fork (src/components/ChatView.tsx bot bubble, formatted-reply.ts,
// ConversationalReply.tsx), Apache-2.0.
// One assistant reply: a chat line in a card, a document as prose, a table-bearing document wider.
// A conversational workspace shows the reply as a few short bubbles instead.

import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { cn } from '@/lib/utils'
import { useChatThreadContext } from '@/components/chat-thread/chat-thread-context'
import { splitConversationalReply } from '../../../../shared/chat-reply-style'
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

const SEGMENT_STAGGER_MS = 120

/** Parts that arrive while the reply is on screen play in; parts already shown never replay. */
function useFreshSegments(segments: readonly string[], streaming: boolean): number {
  const [fresh] = useState(streaming)
  const shown = useRef(fresh ? 0 : segments.length)
  const firstNew = shown.current
  useEffect(() => {
    shown.current = Math.max(shown.current, segments.length)
  }, [segments.length])
  return firstNew
}

function ConversationalSegments(props: { text: string; streaming: boolean }): React.JSX.Element {
  const segments = useMemo(() => splitConversationalReply(props.text), [props.text])
  const firstNew = useFreshSegments(segments, props.streaming)
  return (
    <div data-conversational-reply="" className="flex min-w-0 flex-col items-start gap-1">
      {segments.map((segment, index) => {
        const shape = chatReplyShape(segment)
        const playing = index >= firstNew
        return (
          <div
            key={index}
            data-chat-reply={shape}
            data-reply-segment=""
            className={cn(
              'min-w-0',
              SHAPE_CLASS[shape],
              playing &&
                'animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-200 motion-reduce:animate-none'
            )}
            style={
              playing
                ? { animationDelay: `${(index - firstNew) * SEGMENT_STAGGER_MS}ms` }
                : undefined
            }
          >
            <ChatConversationMarkdown
              text={segment}
              streaming={props.streaming && index === segments.length - 1}
            />
          </div>
        )
      })}
    </div>
  )
}

/** One wrapper whatever the shape, so a streamed reply that grows a list restyles instead of remounting. */
export function ChatReplyBubble(props: {
  text: string
  streaming: boolean
  /** Message actions beside the reply. */
  tray?: React.ReactNode
}): React.JSX.Element {
  const { conversational } = useChatThreadContext()
  const shape = chatReplyShape(props.text)
  return (
    <div className={cn(CHAT_MESSAGE_ROW_CLASS, 'flex w-full items-center justify-start gap-1.5')}>
      {conversational ? (
        <ConversationalSegments text={props.text} streaming={props.streaming} />
      ) : (
        <div data-chat-reply={shape} className={cn('min-w-0', SHAPE_CLASS[shape])}>
          <ChatConversationMarkdown text={props.text} streaming={props.streaming} />
        </div>
      )}
      {props.tray}
    </div>
  )
}
