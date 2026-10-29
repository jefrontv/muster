// Ported from the muster-bots fork (src/components/ChatEmptyState.tsx), Apache-2.0.

import type React from 'react'
import type { ChatWorkspace } from '../../../../shared/chat-mode-types'
import { translate } from '@/i18n/i18n'
import { ChatWorkspaceAvatar } from './ChatWorkspaceAvatar'

/** A chat with no messages yet: the workspace, its name and its brief. */
export function ChatConversationEmpty(props: {
  workspace: ChatWorkspace | null
  /** Shown when the chat has no workspace. */
  fallbackName: string
}): React.JSX.Element {
  const brief = props.workspace?.notes?.trim()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <ChatWorkspaceAvatar workspace={props.workspace} size={64} />
      <h2 className="text-[17px] font-medium leading-6 text-foreground">
        {props.workspace?.name ?? props.fallbackName}
      </h2>
      <p className="line-clamp-3 max-w-[360px] whitespace-pre-line text-sm text-chat-ink-secondary">
        {brief ||
          translate('components.chat-conversation.emptyPrompt', 'Send a message to get started.')}
      </p>
    </div>
  )
}
