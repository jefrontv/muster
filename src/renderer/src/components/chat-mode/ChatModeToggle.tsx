// The Chat/Code mode switch. Rendered at the top of both sidebars so either surface can
// flip to the other; Chat is a full-page TopLevelView, Code restores whatever view the
// user left behind. The active pill is one sliding indicator, not per-button fills, so
// switching modes reads as movement instead of a repaint.

import { MessageCircle, Code2 } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'

// The pill's transition duration; the actual view switch waits for the slide.
const SLIDE_MS = 200

export function ChatModeToggle(): React.JSX.Element | null {
  const activeView = useAppStore((s) => s.activeView)
  const enabled = useAppStore((s) => s.settings?.experimentalChatMode === true)
  const openChatPage = useAppStore((s) => s.openChatPage)
  const closeChatPage = useAppStore((s) => s.closeChatPage)
  // Optimistic selection: the pill slides first, the sidebar swap follows —
  // switching modes remounts this component, so a post-switch slide would
  // never be seen.
  const [pendingChat, setPendingChat] = useState<boolean | null>(null)
  const switchTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (switchTimer.current !== null) {
        window.clearTimeout(switchTimer.current)
      }
    },
    []
  )
  if (!enabled) {
    return null
  }
  const actualInChat = activeView === 'chat'
  const inChat = pendingChat ?? actualInChat

  const switchMode = (toChat: boolean): void => {
    if (toChat === actualInChat || pendingChat !== null) {
      return
    }
    const apply = (): void => {
      if (toChat) {
        openChatPage()
      } else {
        closeChatPage()
      }
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply()
      return
    }
    setPendingChat(toChat)
    switchTimer.current = window.setTimeout(apply, SLIDE_MS)
  }
  const segment =
    'relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors'
  return (
    <div
      role="tablist"
      aria-label={translate('auto.components.chat.mode.toggleLabel', 'App mode')}
      className="relative flex rounded-lg bg-muted/60 p-0.5"
    >
      {/* Sliding active-pill indicator: sized to one segment, translated to the
          selected half. Width math relies on the two flex-1 segments having no gap. */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-background shadow-sm',
          'transition-transform duration-200 ease-out motion-reduce:transition-none',
          !inChat && 'translate-x-full'
        )}
      />
      <button
        type="button"
        role="tab"
        aria-selected={inChat}
        className={cn(
          segment,
          inChat ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => switchMode(true)}
      >
        <MessageCircle className="size-3.5" />
        {translate('auto.components.chat.mode.chat', 'Chat')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={!inChat}
        className={cn(
          segment,
          !inChat ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => switchMode(false)}
      >
        <Code2 className="size-3.5" />
        {translate('auto.components.chat.mode.code', 'Code')}
      </button>
    </div>
  )
}
