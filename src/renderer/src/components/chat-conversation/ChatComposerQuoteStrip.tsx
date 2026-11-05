// The reply being quoted, as a tab on the composer card; X drops it.

import type React from 'react'
import { CornerUpLeft, X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  CHAT_SEAT_TAB_CLASS,
  CHAT_SEAT_TAB_ENTER_CLASS
} from '@/components/native-chat/chat-seat-composer-classes'

export function ChatComposerQuoteStrip(props: {
  quote: string
  onClear: () => void
}): React.JSX.Element {
  const preview = props.quote.replace(/\s+/g, ' ')
  return (
    <div data-composer-quote="" className={`${CHAT_SEAT_TAB_CLASS} ${CHAT_SEAT_TAB_ENTER_CLASS}`}>
      <div className="flex h-9 items-center gap-2 px-3 py-1 text-[13px] leading-6">
        <CornerUpLeft className="size-3.5 shrink-0 text-chat-ink-tertiary" aria-hidden />
        <span className="shrink-0 text-chat-ink-secondary">
          {translate('components.chat-conversation.quote.replyingTo', 'Replying to')}
        </span>
        <span className="min-w-0 flex-1 truncate text-foreground" title={props.quote}>
          {preview}
        </span>
        <button
          type="button"
          onClick={props.onClear}
          aria-label={translate('components.chat-conversation.quote.remove', 'Remove quote')}
          className="grid size-6 shrink-0 place-items-center rounded-full text-chat-ink-tertiary transition-colors duration-100 ease-chat hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
