// Ported from the muster-bots fork (src/styles.css `.ui-pill`), Apache-2.0.

import type React from 'react'
import { cn } from '@/lib/utils'

const PILL_CLASS =
  'inline-flex min-h-7 min-w-0 max-w-full items-center gap-2 rounded-full border border-chat-line-2 bg-sidebar px-3 py-0.5 text-[13px] font-medium leading-5 text-chat-ink-secondary transition-colors duration-100 ease-chat'

const PILL_BUTTON_CLASS =
  'enabled:hover:bg-secondary enabled:hover:text-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent'

/** The one pill in Chat mode: activity runs, the turn fold, thinking and transcript actions. */
export function ChatPill(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { ref?: React.Ref<HTMLButtonElement> }
): React.JSX.Element {
  const { className, type, ...rest } = props
  return (
    <button
      type={type ?? 'button'}
      className={cn(PILL_CLASS, PILL_BUTTON_CLASS, className)}
      {...rest}
    />
  )
}

/** A pill that only labels something: a count, a status. */
export function ChatPillLabel(props: React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  const { className, ...rest } = props
  return <span className={cn(PILL_CLASS, className)} {...rest} />
}
