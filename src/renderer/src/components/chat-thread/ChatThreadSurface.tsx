// Chat mode's thread transcript, drawn from main's chat engine. It replaces
// NativeChatView for chat threads only; Code mode keeps NativeChatView.

import { useMemo } from 'react'
import type React from 'react'
import { Loader2 } from 'lucide-react'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import { ChatThreadContext, type ChatThreadContextValue } from './chat-thread-context'
import { ChatTurnView } from './ChatTurnView'
import {
  useChatEngineMeta,
  useChatEngineThreadLoaded,
  useChatEngineTurnOrder,
  useRetainChatEngineThread
} from './use-chat-engine-thread'

export function ChatThreadSurface(props: {
  threadId: string
  onLinkClick?: CommentMarkdownLinkClickHandler
  /** Sits below the transcript; the composer seat. */
  footer?: React.ReactNode
}): React.JSX.Element {
  const { threadId, onLinkClick } = props
  useRetainChatEngineThread(threadId)
  const loaded = useChatEngineThreadLoaded(threadId)
  const order = useChatEngineTurnOrder(threadId)
  const cwd = useChatEngineMeta(threadId)?.session.cwd ?? null
  const context = useMemo<ChatThreadContextValue>(
    () => ({ threadId, cwd, ...(onLinkClick ? { onLinkClick } : {}) }),
    [threadId, cwd, onLinkClick]
  )
  return (
    <ChatThreadContext.Provider value={context}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto flex w-[clamp(680px,64%,920px)] max-w-full flex-col gap-6 px-4 py-6">
            {!loaded ? (
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                {translate('components.chat-thread.loading', 'Loading chat')}
              </div>
            ) : (
              order.map((turnId) => (
                <ChatTurnView key={turnId} threadId={threadId} turnId={turnId} />
              ))
            )}
          </div>
        </div>
        {props.footer}
      </div>
    </ChatThreadContext.Provider>
  )
}
