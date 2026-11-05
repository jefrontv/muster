// Ported from the muster-bots fork (src/components/MessageActions.tsx), Apache-2.0.
// Actions beside a message, shown on hover by opacity only so nothing shifts.

import type React from 'react'
import { CornerUpLeft, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

/** Hover target for a tray: put it on the row that holds the message and its tray. */
export const CHAT_MESSAGE_ROW_CLASS = 'group/message'

export const CHAT_MESSAGE_ACTION_CLASS =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-chat-ink-tertiary transition-colors duration-100 ease-chat hover:bg-chat-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent disabled:opacity-50 [&_svg]:size-4'

export function ChatMessageTray(props: {
  children: React.ReactNode
  /** Stay visible without hover, for an action the reader needs now (Try again). */
  shown?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-0.5',
        // Touch screens have no hover, so the tray stays put there.
        !props.shown &&
          '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:duration-100 [@media(hover:hover)]:group-hover/message:opacity-100 [@media(hover:hover)]:focus-within:opacity-100',
        props.className
      )}
    >
      {props.children}
    </div>
  )
}

export function ChatReplyAction(props: { onReply: () => void }): React.JSX.Element {
  const label = translate('components.chat-conversation.quote.reply', 'Reply')
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={props.onReply}
      className={CHAT_MESSAGE_ACTION_CLASS}
    >
      <CornerUpLeft aria-hidden />
    </button>
  )
}

export function ChatRetryAction(props: { onRetry: () => void }): React.JSX.Element {
  const label = translate('components.chat-thread.retry', 'Try again')
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={props.onRetry}
      className={CHAT_MESSAGE_ACTION_CLASS}
    >
      <RotateCcw aria-hidden />
    </button>
  )
}
