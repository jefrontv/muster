// The Chat/Code mode switch. Rendered at the top of both sidebars so either surface can
// flip to the other; Chat is a full-page TopLevelView, Code restores whatever view the
// user left behind. The active pill is one sliding indicator, not per-button fills, so
// switching modes reads as movement instead of a repaint.

import { MessageCircle, Code2 } from 'lucide-react'
import type React from 'react'
import { useEffect } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'

// Why a bare "seen one" flag rather than remembering which side: the Chat page is lazy,
// so its toggle mounts in a LATER commit than the one that switched modes — by then any
// remembered mode has already advanced and the incoming pill computes "already there"
// and never slides. A pill that is not the session's first can only exist because the
// mode changed, so the direction is just the mode being entered.
let pillSeenOnce = false

export function ChatModeToggle(): React.JSX.Element | null {
  const activeView = useAppStore((s) => s.activeView)
  const enabled = useAppStore((s) => s.settings?.experimentalChatMode === true)
  const openChatPage = useAppStore((s) => s.openChatPage)
  const closeChatPage = useAppStore((s) => s.closeChatPage)
  const inChat = activeView === 'chat'
  // Read during render, set after it: the app's first paint is a cold render that must
  // not slide, every pill after it followed a switch.
  const slideClass = !pillSeenOnce
    ? null
    : inChat
      ? 'chat-mode-pill-to-chat'
      : 'chat-mode-pill-to-code'
  useEffect(() => {
    pillSeenOnce = true
  }, [])

  if (!enabled) {
    return null
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
          selected half. Width math relies on the two flex-1 segments having no gap.
          Keyed by mode so the element is rebuilt on every switch: returning to Code
          re-reveals a sidebar that never unmounted, and a transform changed while it
          was hidden would otherwise land already-settled with nothing to animate. */}
      <div
        key={inChat ? 'chat' : 'code'}
        aria-hidden
        className={cn(
          'absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-background shadow-sm',
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
