// Ported from the muster-bots fork (src/components/ChatView.tsx layout, JumpToLatestButton.tsx), Apache-2.0.
// Chat mode's transcript: one centred column under a fading header pill, with the
// composer docked at the bottom on plain page colour. Data comes from the chat engine.

import { useCallback, useMemo, useRef } from 'react'
import type React from 'react'
import { ArrowDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import {
  ChatThreadContext,
  type ChatThreadContextValue
} from '@/components/chat-thread/chat-thread-context'
import {
  useChatTurnPaging,
  type ChatEarlierHistory
} from '@/components/chat-thread/use-chat-turn-paging'
import {
  useChatScrollFollow,
  useFollowOnNewTurn
} from '@/components/chat-thread/use-chat-scroll-follow'
import {
  useChatEngineMeta,
  useChatEngineThreadLoaded,
  useChatEngineTurnOrder,
  useRetainChatEngineThread
} from '@/components/chat-thread/use-chat-engine-thread'
import { CHAT_CONVERSATION_COLUMN_CLASS } from './chat-conversation-column'
import { ChatConversationTurn } from './ChatConversationTurn'
import { ChatSubagentFocusView } from './ChatSubagentFocusView'
import { useChatSubagentFocus } from './use-chat-subagent-focus'
import type { ChatRosterAgent } from './chat-subagent-focus'

function JumpToLatest(props: { visible: boolean; onClick: () => void }): React.JSX.Element {
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
        'absolute bottom-full left-1/2 z-[2] mb-2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full bg-chat-raised text-foreground shadow-chat-soft transition-[opacity,background-color] duration-100 ease-chat hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent',
        !props.visible && 'pointer-events-none opacity-0'
      )}
    >
      <ArrowDown className="size-[18px]" aria-hidden />
    </button>
  )
}

export function ChatConversationSurface(props: {
  threadId: string
  onRetry?: (text: string) => void
  onQuote?: (text: string) => void
  conversational?: boolean
  unreadSince?: number | null
  /** File links (the Code panel opens them in the editor). */
  onLinkClick?: CommentMarkdownLinkClickHandler
  /** Older history fetched when the reader nears the top. */
  earlier?: ChatEarlierHistory
  /** Drawn instead of the turns (loading or a load error); the composer stays docked. */
  placeholder?: React.ReactNode
  /** Undo needs the engine's own CLI; the Code panel mirrors a terminal session and has none. */
  canUndo?: boolean
  /** False where subagents' steps never reach the thread (the Code panel). */
  streamsAgentSteps?: boolean
  /** Accessible name of the transcript. */
  label: string
  /** The header pill row; it stays on top and the transcript fades under it. */
  header?: React.ReactNode
  /** Drawn in the column while the thread has no turns. */
  empty?: React.ReactNode
  /** The composer, docked at the bottom of the column. */
  footer?: React.ReactNode
}): React.JSX.Element {
  const {
    threadId,
    onRetry,
    onQuote,
    onLinkClick,
    conversational = false,
    unreadSince = null,
    canUndo = true,
    streamsAgentSteps = true
  } = props
  useRetainChatEngineThread(threadId)
  const loaded = useChatEngineThreadLoaded(threadId)
  const order = useChatEngineTurnOrder(threadId)
  const meta = useChatEngineMeta(threadId)
  const cwd = meta?.session.cwd ?? null
  const scroll = useChatScrollFollow(threadId)
  useFollowOnNewTurn(order.length, scroll.follow)
  const paging = useChatTurnPaging(threadId, order, scroll.scrollRef, props.earlier)
  const focus = useChatSubagentFocus(threadId)
  const { open: openFocus, openRoster } = focus
  const { follow, scrollRef } = scroll
  // Where the transcript was, for an agent with no row of its own to return to.
  const transcriptTop = useRef<number | null>(null)
  const leaveTranscript = useCallback(() => {
    const scroller = scrollRef.current
    if (scroller && !scroller.querySelector('[data-subagent-focus]')) {
      transcriptTop.current = scroller.scrollTop
    }
  }, [scrollRef])
  const openAgent = useCallback(
    (agentId: string) => {
      leaveTranscript()
      openFocus({ agentId, roster: null })
      follow()
    },
    [leaveTranscript, openFocus, follow]
  )
  const openRosterAgent = useCallback(
    (roster: readonly ChatRosterAgent[], target: ChatRosterAgent) => {
      leaveTranscript()
      openRoster(roster, target)
      follow()
    },
    [leaveTranscript, openRoster, follow]
  )
  // Back in the transcript, bring the agent the user left into view.
  const onFocusReturn = useCallback(
    (agentId: string | null) => {
      requestAnimationFrame(() => {
        const scroller = scrollRef.current
        const run = agentId && scroller?.querySelector(`[data-agent-run="${CSS.escape(agentId)}"]`)
        if (run) {
          run.scrollIntoView({ block: 'center' })
        } else if (scroller && transcriptTop.current !== null) {
          scroller.scrollTop = transcriptTop.current
        }
      })
    },
    [scrollRef]
  )
  const context = useMemo<ChatThreadContextValue>(
    () => ({
      threadId,
      cwd,
      conversational,
      unreadSince,
      ...(onRetry ? { onRetry } : {}),
      ...(onQuote ? { onQuote } : {}),
      ...(onLinkClick ? { onLinkClick } : {}),
      canUndo,
      streamsAgentSteps,
      openAgent,
      openRosterAgent
    }),
    [
      threadId,
      cwd,
      conversational,
      unreadSince,
      onRetry,
      onQuote,
      onLinkClick,
      canUndo,
      streamsAgentSteps,
      openAgent,
      openRosterAgent
    ]
  )
  const focused = focus.stack.length > 0
  const latest = order.at(-1)
  const empty = loaded && order.length === 0
  return (
    <ChatThreadContext.Provider value={context}>
      {/* The container is the pane, so a narrow Code pane gets narrow gutters and full-width bubbles. */}
      <div className="@container/chat-conversation h-full min-h-0">
        <div
          ref={scroll.scrollRef}
          data-chat-conversation-scroller=""
          data-header={props.header ? '' : undefined}
          className="group/conversation scrollbar-sleek h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-background px-(--chat-gutter) [overflow-anchor:none] [scrollbar-gutter:stable]"
          tabIndex={-1}
        >
          <div className="flex min-h-full flex-col">
            {props.header && (
              // Sticky inside the scroller, so the transcript scrolls under it and fades out.
              <div className="pointer-events-none sticky top-0 z-10 -mx-(--chat-gutter) bg-gradient-to-b from-background to-transparent px-(--chat-gutter)">
                <div className={CHAT_CONVERSATION_COLUMN_CLASS}>{props.header}</div>
              </div>
            )}
            <div
              ref={scroll.contentRef}
              role="log"
              // off: a polite log would re-read every streamed token; the turn announces its outcome once.
              aria-live="off"
              aria-label={props.label}
              className={cn(CHAT_CONVERSATION_COLUMN_CLASS, 'flex flex-1 flex-col gap-3 pt-2 pb-6')}
            >
              {focused && (
                <ChatSubagentFocusView threadId={threadId} focus={focus} onReturn={onFocusReturn} />
              )}
              {/* Hidden, not unmounted, so open folds survive and the way back lands on the agent. */}
              <div className={focused ? 'hidden' : 'contents'}>
                {paging.hasEarlier && <div ref={paging.sentinelRef} aria-hidden className="h-px" />}
                {props.placeholder ? (
                  props.placeholder
                ) : !loaded ? (
                  <div className="flex items-center gap-2 text-[13px] text-chat-ink-tertiary">
                    <Loader2
                      className="size-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                    {translate('components.chat-thread.loading', 'Loading chat')}
                  </div>
                ) : empty ? (
                  props.empty
                ) : (
                  paging.visible.map((turnId, index) => (
                    <ChatConversationTurn
                      key={turnId}
                      threadId={threadId}
                      turnId={turnId}
                      // The first paged-in turn still needs its real predecessor for the day line.
                      previousTurnId={
                        index > 0
                          ? paging.visible[index - 1]
                          : (order[order.indexOf(turnId) - 1] ?? null)
                      }
                      latest={turnId === latest}
                    />
                  ))
                )}
              </div>
            </div>
            {props.footer && (
              <div className="sticky bottom-0 z-10">
                <div className={cn(CHAT_CONVERSATION_COLUMN_CLASS, 'relative pb-3')}>
                  <JumpToLatest visible={scroll.state.away} onClick={scroll.follow} />
                  {/* Plain page colour from the composer's middle down, so the transcript ends at the card with no fade. */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -inset-x-(--chat-gutter) top-1/2 bottom-0 bg-background"
                  />
                  <div className="relative z-[1]">{props.footer}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ChatThreadContext.Provider>
  )
}
