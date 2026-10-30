// Ported from the muster-bots fork (ChatView.tsx DaySeparator, lib/transcript-derivations.ts), Apache-2.0.

import type React from 'react'
import { i18n, translate } from '@/i18n/i18n'

/** Days since the epoch in local time, so two stamps compare by calendar day. */
export function localDay(at: number): number {
  const date = new Date(at)
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
}

/** A turn opens a new day when it is the first, or the one before it fell on another day. */
export function startsNewDay(previousAt: number | null, at: number): boolean {
  return previousAt === null || localDay(previousAt) !== localDay(at)
}

export function chatDayLabel(at: number, now = Date.now()): string {
  const daysAgo = localDay(now) - localDay(at)
  if (daysAgo === 0) {
    return translate('components.chat-conversation.today', 'Today')
  }
  if (daysAgo === 1) {
    return translate('components.chat-conversation.yesterday', 'Yesterday')
  }
  return new Intl.DateTimeFormat(i18n.language || undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(at)
}

export function ChatDaySeparator({ at }: { at: number }): React.JSX.Element {
  const time = new Intl.DateTimeFormat(i18n.language || undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(at)
  return (
    <div className="py-3 text-center text-[13px] text-chat-ink-secondary">
      {chatDayLabel(at)} {time}
    </div>
  )
}
