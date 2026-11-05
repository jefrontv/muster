// Ported from the muster-bots fork (src/components/ChatView.tsx user bubble), Apache-2.0.
// The user's message: attachments, then the bubble; a long message folds until asked.

import { useMemo, useState } from 'react'
import type React from 'react'
import { FileText, Image as ImageIcon } from 'lucide-react'
import { basename } from '@/lib/path'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { NativeChatCopyButton } from '@/components/native-chat/NativeChatCopyButton'
import { NativeChatImageThumb } from '@/components/native-chat/NativeChatImageThumb'
import { NativeChatTaskChip } from '@/components/native-chat/NativeChatTaskChip'
import {
  chatUserMessageParts,
  type ChatUserMessageParts
} from '@/components/chat-thread/chat-user-message-parts'
import {
  CHAT_MESSAGE_ACTION_CLASS,
  CHAT_MESSAGE_ROW_CLASS,
  ChatMessageTray
} from './ChatMessageTray'
import { splitQuotedMessage } from './chat-composer-quote'

const COLLAPSE_CHARS = 600
const COLLAPSE_LINES = 8

export function userMessageCollapses(text: string): boolean {
  return text.length > COLLAPSE_CHARS || text.split('\n').length > COLLAPSE_LINES
}

function Attachments(props: { parts: ChatUserMessageParts }): React.JSX.Element | null {
  const { images, files, taskIds } = props.parts
  if (images.length + files.length + taskIds.length === 0) {
    return null
  }
  return (
    <div className="flex max-w-full flex-wrap justify-end gap-1.5">
      {images.map((path) => (
        <NativeChatImageThumb
          key={path}
          path={path}
          alt={translate('components.native-chat.composer.pastedImageLabel', 'Pasted image')}
          className="h-auto max-h-60 max-w-full rounded-chat-reply"
          placeholderClassName="size-24 rounded-chat-reply"
        />
      ))}
      {taskIds.map((taskId) => (
        <NativeChatTaskChip key={taskId} taskId={taskId} />
      ))}
      {files.map((path) => (
        <div
          key={path}
          title={path}
          className="flex max-w-full items-center gap-1.5 rounded-lg bg-chat-bubble px-2 py-1 text-xs text-chat-ink-secondary"
        >
          <FileText className="size-3.5 shrink-0" aria-hidden />
          <span className="max-w-56 truncate">{basename(path)}</span>
        </div>
      ))}
    </div>
  )
}

function ImageCount(props: { count: number }): React.JSX.Element {
  return (
    <div className="flex items-center gap-1 pt-1 text-xs text-chat-ink-tertiary">
      <ImageIcon className="size-3" aria-hidden />
      {props.count === 1
        ? translate('components.chat-thread.imageOne', '1 image')
        : translate('components.chat-thread.imageMany', '{{count}} images', {
            count: props.count
          })}
    </div>
  )
}

export function ChatUserBubble(props: {
  text: string
  imageCount: number
  /** Footnote under the text, such as a steer that has not landed yet. */
  note?: string
}): React.JSX.Element {
  const parsed = useMemo(() => chatUserMessageParts(props.text), [props.text])
  const { quote, body } = useMemo(() => splitQuotedMessage(parsed.body), [parsed.body])
  const parts = { ...parsed, body }
  const [expanded, setExpanded] = useState(false)
  // Images sent without a path note (older sends) can only be counted.
  const uncounted = Math.max(0, props.imageCount - parts.images.length)
  const collapsible = userMessageCollapses(parts.body)
  const folded = collapsible && !expanded
  return (
    <div className={cn(CHAT_MESSAGE_ROW_CLASS, 'flex w-full items-center justify-end gap-1.5')}>
      <ChatMessageTray>
        <NativeChatCopyButton text={parts.typed} className={CHAT_MESSAGE_ACTION_CLASS} />
      </ChatMessageTray>
      <div className="flex min-w-0 max-w-(--chat-reply-max) flex-col items-end gap-2">
        <Attachments parts={parts} />
        {(parts.body || quote || uncounted > 0) && (
          <div className="max-w-full rounded-chat-reply bg-chat-bubble px-4 py-2.5 text-chat text-foreground">
            {quote && (
              <div
                data-user-quote=""
                title={quote}
                className="mb-1.5 line-clamp-2 border-l-2 border-chat-line-3 pl-2 text-[13px] leading-5 text-chat-ink-secondary"
              >
                {quote}
              </div>
            )}
            <div
              className={cn(
                'whitespace-pre-wrap break-words',
                folded &&
                  'max-h-40 overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]'
              )}
            >
              {parts.body}
            </div>
            {uncounted > 0 && <ImageCount count={uncounted} />}
            {props.note && <div className="pt-1 text-xs text-chat-ink-tertiary">{props.note}</div>}
            {collapsible && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                className="mt-1 rounded-sm text-[13px] text-chat-ink-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
              >
                {expanded
                  ? translate('components.chat-conversation.showLess', 'Show less')
                  : translate('components.chat-conversation.showFull', 'Show full message')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
