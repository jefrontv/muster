// The Chat/Code mode switch. Rendered at the top of both sidebars so either surface can
// flip to the other; Chat is a full-page TopLevelView, Code restores whatever view the
// user left behind.

import { MessageCircle, Code2 } from 'lucide-react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'

export function ChatModeToggle(): React.JSX.Element | null {
  const activeView = useAppStore((s) => s.activeView)
  const enabled = useAppStore((s) => s.settings?.experimentalChatMode === true)
  const openChatPage = useAppStore((s) => s.openChatPage)
  const closeChatPage = useAppStore((s) => s.closeChatPage)
  if (!enabled) {
    return null
  }
  const inChat = activeView === 'chat'
  const segment =
    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors'
  return (
    <div
      role="tablist"
      aria-label={translate('auto.components.chat.mode.toggleLabel', 'App mode')}
      className="flex gap-0.5 rounded-lg bg-muted/60 p-0.5"
    >
      <button
        type="button"
        role="tab"
        aria-selected={inChat}
        className={cn(
          segment,
          inChat
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
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
          !inChat
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
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
