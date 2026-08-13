// The Chat/Code mode switch. Rendered at the top of both sidebars so either surface can
// flip to the other; Chat is a full-page TopLevelView, Code restores whatever view the
// user left behind. The active pill is one sliding indicator, not per-button fills, so
// switching modes reads as movement instead of a repaint.

import { MessageCircle, Code2 } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'

const SLIDE_MS = 200

// Why a bare "seen one" flag: the two sidebars are separate subtrees (Chat's lives
// inside the lazy chat page), so no instance state spans a switch. A toggle that is not
// the session's first is mounting because the mode changed, so it slides in — and the
// app's cold first paint must not.
let pillSeenOnce = false

export function ChatModeToggle({ mode }: { mode: 'chat' | 'code' }): React.JSX.Element | null {
  const enabled = useAppStore((s) => s.settings?.experimentalChatMode === true)
  const openChatPage = useAppStore((s) => s.openChatPage)
  const closeChatPage = useAppStore((s) => s.closeChatPage)
  // Why the owning sidebar's mode, not the live view: on a switch the outgoing sidebar
  // re-renders before it unmounts, and a view-driven pill would snap across inside a
  // sidebar that is about to vanish — the user sees the jump, then the incoming pill
  // arrives already settled. Pinning each toggle to its own surface keeps the pill still
  // and makes the slide a pure entrance.
  const inChat = mode === 'chat'
  const pillRef = useRef<HTMLDivElement | null>(null)

  // Why script the slide here instead of a CSS mount animation: a CSS animation starts
  // at style recalc, and the chat sidebar's first paint lands well after that (lazy
  // chunk + heavy mount) — the slide would be over before anything reached the screen.
  // An effect runs after paint, so the pill is visibly at its old side when it starts.
  useEffect(() => {
    const el = pillRef.current
    if (!pillSeenOnce) {
      pillSeenOnce = true
      return
    }
    // typeof check: jsdom/happy-dom have no Web Animations API.
    if (
      !el ||
      typeof el.animate !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    const animation = el.animate(
      [{ transform: inChat ? 'translateX(100%)' : 'translateX(-100%)' }, { transform: 'none' }],
      { duration: SLIDE_MS, easing: 'ease-out', composite: 'add' }
    )
    return () => animation.cancel()
  }, [inChat])

  if (!enabled) {
    return null
  }
  const segment =
    'relative z-10 flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] px-2 text-[13px] font-medium tracking-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60'
  return (
    <div
      role="tablist"
      aria-label={translate('auto.components.chat.mode.toggleLabel', 'App mode')}
      className="relative flex rounded-[9px] border border-border bg-foreground/[0.04] p-0.5"
    >
      {/* Sliding active-pill: a lift, not a hole. bg-background is darker than
          the worktree sidebar, so a foreground wash + hairline reads as the thumb. */}
      <div
        ref={pillRef}
        aria-hidden
        className={cn(
          'absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[7px] bg-foreground/10 shadow-xs ring-1 ring-foreground/10',
          !inChat && 'translate-x-full'
        )}
      />
      <button
        type="button"
        role="tab"
        aria-selected={inChat}
        className={cn(
          segment,
          inChat ? 'text-foreground' : 'text-foreground/50 hover:text-foreground/80'
        )}
        onClick={() => {
          if (!inChat) {
            openChatPage()
          }
        }}
      >
        <MessageCircle className="size-3.5" strokeWidth={inChat ? 2.25 : 1.75} />
        {translate('auto.components.chat.mode.chat', 'Chat')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={!inChat}
        className={cn(
          segment,
          !inChat ? 'text-foreground' : 'text-foreground/50 hover:text-foreground/80'
        )}
        onClick={() => {
          if (inChat) {
            closeChatPage()
          }
        }}
      >
        <Code2 className="size-3.5" strokeWidth={!inChat ? 2.25 : 1.75} />
        {translate('auto.components.chat.mode.code', 'Code')}
      </button>
    </div>
  )
}
