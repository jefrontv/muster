// A "New" line above the first turn that finished while the user was away.

import type React from 'react'
import { translate } from '@/i18n/i18n'

/** True for the first turn that ended after `since`; null `since` means nothing was unread. */
export function startsUnread(
  since: number | null | undefined,
  previousEndedAt: number | null,
  endedAt: number | null
): boolean {
  if (since === null || since === undefined || endedAt === null || endedAt <= since) {
    return false
  }
  return previousEndedAt === null || previousEndedAt <= since
}

export function ChatUnreadDivider(): React.JSX.Element {
  return (
    <div data-unread-divider="" role="separator" className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-chat-accent/40" />
      <span className="text-xs font-medium text-chat-accent">
        {translate('components.chat-conversation.unreadDivider', 'New')}
      </span>
      <span className="h-px flex-1 bg-chat-accent/40" />
    </div>
  )
}
