// The Chat/Code mode switch. Rendered at the top of both sidebars so either surface can
// flip to the other; Chat is a full-page TopLevelView, Code restores whatever view the
// user left behind. The active pill is one sliding indicator, not per-button fills, so
// switching modes reads as movement instead of a repaint.

import { MessageCircle, Code2 } from 'lucide-react'
import type React from 'react'
import { useRef } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'

// Why module scope: switching modes swaps sidebars, so this component unmounts and a
// different instance mounts — the slide has to be a mount animation, and a fresh
// instance cannot know it is a re-entry. Only the app's very first mount is a cold
// render that must not slide; every later mount followed a sidebar swap, so the
// direction is simply the mode being entered. The view switch is never delayed by it.
let toggleHasMounted = false

export function ChatModeToggle(): React.JSX.Element | null {
  const activeView = useAppStore((s) => s.activeView)
  const enabled = useAppStore((s) => s.settings?.experimentalChatMode === true)
  const openChatPage = useAppStore((s) => s.openChatPage)
  const closeChatPage = useAppStore((s) => s.closeChatPage)
  const inChat = activeView === 'chat'
  // Claimed once per instance, on its first render; ref-guarded so a StrictMode double
  // render (and any later re-render) keeps the same answer.
  const slideRef = useRef<string | null | undefined>(undefined)
  if (slideRef.current === undefined) {
    slideRef.current = !toggleHasMounted
      ? null
      : inChat
        ? 'chat-mode-pill-to-chat'
        : 'chat-mode-pill-to-code'
    toggleHasMounted = true
  }

  if (!enabled) {
    return null
  }
  const slideClass = slideRef.current
  const segment =
    'relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors'
  return (
    <div
      role="tablist"
      aria-label={translate('auto.components.chat.mode.toggleLabel', 'App mode')}
      className="relative flex rounded-lg bg-muted/60 p-0.5"
    >
      {/* Sliding active-pill indicator: sized to one segment, translated to the
          selected half. Width math relies on the two flex-1 segments having no gap.
          The transition covers in-place flips (mode changed from elsewhere); the
          animation class covers the sidebar-swap remount. */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-background shadow-sm',
          'transition-transform duration-200 ease-out motion-reduce:transition-none',
          !inChat && 'translate-x-full',
          slideClass
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
        onClick={() => {
          if (!inChat) {
            openChatPage()
          }
        }}
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
        onClick={() => {
          if (inChat) {
            closeChatPage()
          }
        }}
      >
        <Code2 className="size-3.5" />
        {translate('auto.components.chat.mode.code', 'Code')}
      </button>
    </div>
  )
}
