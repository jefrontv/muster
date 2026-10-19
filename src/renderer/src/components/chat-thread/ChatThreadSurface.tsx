// Chat mode's thread transcript, drawn from main's chat engine. It replaces
// NativeChatView for chat threads only; Code mode keeps NativeChatView.

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { ArrowDown, Loader2 } from 'lucide-react'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { ChatThreadContext, type ChatThreadContextValue } from './chat-thread-context'
import { ChatTurnNavigator } from './ChatTurnNavigator'
import { ChatTurnView } from './ChatTurnView'
import { useChatActiveTurn } from './use-chat-active-turn'
import { useChatTurnPaging } from './use-chat-turn-paging'
import { useChatScrollFollow, useFollowOnNewTurn } from './use-chat-scroll-follow'
import {
  useChatEngineMeta,
  useChatEngineThreadLoaded,
  useChatEngineTurnOrder,
  useRetainChatEngineThread
} from './use-chat-engine-thread'

/** The transcript column and everything that shares its width. */
export const CHAT_COLUMN_CLASS = 'mx-auto w-(--chat-content-width) max-w-full px-4'

function BackToBottom(props: { visible: boolean; onClick: () => void }): React.JSX.Element {
  const label = translate('components.chat-thread.backToBottom', 'Back to latest')
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      tabIndex={props.visible ? 0 : -1}
      aria-hidden={!props.visible}
      onClick={props.onClick}
      className={cn(
        'absolute bottom-full left-1/2 mb-4 flex size-[34px] -translate-x-1/2 items-center justify-center rounded-full bg-background text-chat-ink-secondary shadow-chat-soft transition-opacity duration-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !props.visible && 'pointer-events-none opacity-0'
      )}
    >
      <ArrowDown className="size-4" aria-hidden />
    </button>
  )
}

export function ChatThreadSurface(props: {
  threadId: string
  onLinkClick?: CommentMarkdownLinkClickHandler
  onRetry?: (text: string) => void
  /** The composer; it sits in a sticky seat at the transcript's width. */
  footer?: React.ReactNode
}): React.JSX.Element {
  const { threadId, onLinkClick, onRetry } = props
  useRetainChatEngineThread(threadId)
  const loaded = useChatEngineThreadLoaded(threadId)
  const order = useChatEngineTurnOrder(threadId)
  const meta = useChatEngineMeta(threadId)
  const cwd = meta?.session.cwd ?? null
  const scroll = useChatScrollFollow(threadId)
  useFollowOnNewTurn(order.length, scroll.follow)
  const seatRef = useRef<HTMLDivElement | null>(null)
  const paging = useChatTurnPaging(threadId, order, scroll.scrollRef)
  const rendered = useMemo(() => new Set(paging.visible), [paging.visible])
  const active = useChatActiveTurn(scroll.scrollRef, seatRef, order)
  const { release, scrollRef } = scroll
  const { revealTurn } = paging
  // Object identity, so jumping to the same turn twice still scrolls.
  const [jump, setJump] = useState<{ turnId: string } | null>(null)
  const jumpToTurn = useCallback(
    (turnId: string) => {
      if (revealTurn(turnId)) {
        release()
        setJump({ turnId })
      }
    },
    [release, revealTurn]
  )
  // Runs after paging's anchor restore, once the turn is in the DOM.
  useLayoutEffect(() => {
    if (!jump) {
      return
    }
    const section = scrollRef.current?.querySelector(
      `section[data-turn-id="${CSS.escape(jump.turnId)}"]`
    )
    if (section) {
      section.scrollIntoView({ block: 'start' })
      setJump(null)
    }
  }, [jump, paging.visible, scrollRef])
  const context = useMemo<ChatThreadContextValue>(
    () => ({
      threadId,
      cwd,
      ...(onLinkClick ? { onLinkClick } : {}),
      ...(onRetry ? { onRetry } : {})
    }),
    [threadId, cwd, onLinkClick, onRetry]
  )
  const latest = order.at(-1)
  const busyTurnId = meta?.status === 'working' ? (latest ?? null) : null
  // An empty thread centres the composer under one line of type, at the same width as when docked.
  const hero = loaded && order.length === 0
  return (
    <ChatThreadContext.Provider value={context}>
      <div
        ref={scroll.scrollRef}
        className="@container h-full min-h-0 overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable]"
        tabIndex={-1}
      >
        {/* Zero-height sticky slot: the rail centres in the band above the composer. Hidden on narrow columns. */}
        {/* Not `hidden` plus a variant: an unlayered `.hidden` elsewhere outranks the utility layer. */}
        <div className="pointer-events-none sticky top-0 z-[7] h-0 @max-[900px]:hidden">
          <div className="absolute right-3 -translate-y-1/2" style={{ top: active.bandHeight / 2 }}>
            <ChatTurnNavigator
              threadId={threadId}
              order={order}
              rendered={rendered}
              activeIndex={active.activeIndex}
              busyTurnId={busyTurnId}
              bandHeight={active.bandHeight}
              onJump={jumpToTurn}
            />
          </div>
        </div>
        <div className={cn('flex min-h-full flex-col', hero && 'justify-center pb-8')}>
          <div
            ref={scroll.contentRef}
            className={cn(CHAT_COLUMN_CLASS, hero ? 'pb-6' : 'flex-1 pb-4 pt-6')}
          >
            {paging.hasEarlier && <div ref={paging.sentinelRef} aria-hidden className="h-px" />}
            <div className="flex flex-col gap-6">
              {hero ? (
                <h2 className="text-center text-[26px] font-medium leading-8 text-foreground">
                  {translate('components.chat-thread.emptyTitle', 'What should we work on?')}
                </h2>
              ) : !loaded ? (
                <div className="flex items-center gap-2 text-[13px] text-chat-ink-tertiary">
                  <Loader2
                    className="size-3.5 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                  {translate('components.chat-thread.loading', 'Loading chat')}
                </div>
              ) : (
                paging.visible.map((turnId) => (
                  <ChatTurnView
                    key={turnId}
                    threadId={threadId}
                    turnId={turnId}
                    latest={turnId === latest}
                  />
                ))
              )}
            </div>
          </div>
          {props.footer && (
            <div ref={seatRef} className={cn(!hero && 'sticky bottom-0 z-10')}>
              {/* Fixed height, so text dissolves into the seat at the same rate however tall the composer grows. */}
              {!hero && (
                <div className="pointer-events-none h-9 bg-gradient-to-b from-transparent to-background" />
              )}
              <div className="bg-background pb-4">
                <div className={cn(CHAT_COLUMN_CLASS, 'relative')}>
                  <BackToBottom visible={scroll.state.away} onClick={scroll.follow} />
                  {props.footer}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ChatThreadContext.Provider>
  )
}
