import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { ArrowDown } from 'lucide-react'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import type { NativeChatLiveSession } from './use-native-chat-live-session'
import { nativeChatMessageText } from './native-chat-turn-folds'
import { useNativeChatScrollAnchoring } from './use-native-chat-scroll-anchoring'
import { NATIVE_CHAT_SCROLL_CONTAINER_ATTR } from './use-native-chat-toggle-scroll-compensation'
import {
  NativeChatTimelineRowView,
  type NativeChatTimelineRowActions
} from './NativeChatTimelineRowView'
import { NativeChatWorkingRow } from './NativeChatWorkingRow'
import { useNativeChatTimeline } from './use-native-chat-timeline'
import { NATIVE_CHAT_STREAMING_ID } from '../../../../shared/native-chat-streaming'

export function NativeChatMessageList({
  session,
  isWorking,
  fontScale,
  onLinkClick,
  allowFileUriLinks = false,
  failedDeliveryMessageIds,
  workingSince = null,
  lastError = null,
  onRetry
}: {
  session: NativeChatLiveSession
  isWorking: boolean
  /** Chat-only text multiplier (1 = default), driven by the zoom shortcuts. */
  fontScale: number
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
  failedDeliveryMessageIds?: ReadonlySet<string>
  /** Epoch ms the current working state began (drives "Working for {t}"). */
  workingSince?: number | null
  /** The last turn's failure, shown inline at its end. */
  lastError?: string | null
  /** Resend a turn's prompt; null means the latest. */
  onRetry?: (replyMessageId: string | null) => void
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const spacerRef = useRef<HTMLDivElement | null>(null)

  const { hasMore, loadingEarlier, loadEarlier, sessionId } = session

  const { messages, rows, toggle, workingStepLabel } = useNativeChatTimeline({
    rawMessages: session.messages,
    isWorking,
    lastError
  })
  const showWorkingRow =
    isWorking && !messages.some((message) => message.id === NATIVE_CHAT_STREAMING_ID)

  const anchoring = useNativeChatScrollAnchoring({ scrollRef, contentRef, spacerRef, isWorking })
  const {
    anchorToMessage,
    scrollToEnd,
    maintainAfterRender,
    onScroll: onAnchoringScroll
  } = anchoring

  // When an older page prepends, the scroll content grows above the viewport.
  // Capture the pre-render scroll height so the layout effect can restore the
  // user's position (no jump) instead of letting the browser keep scrollTop.
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)

  // Shared by the scroll-to-top trigger and the "Load earlier" button so both
  // paths restore the viewport after the prepend (the button path used to skip
  // the anchor and jump to the top of the new page).
  const loadEarlierAnchored = useCallback(() => {
    const el = scrollRef.current
    if (el) {
      prependAnchorRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop }
    }
    loadEarlier()
  }, [loadEarlier])

  // The transcript shows the whole conversation: keep pulling older pages until
  // the history is exhausted, rather than making the user ask for each one. The
  // paging itself stays — it is what keeps a huge transcript off the first paint.
  useEffect(() => {
    if (hasMore && !loadingEarlier) {
      loadEarlierAnchored()
    }
  }, [hasMore, loadingEarlier, loadEarlierAnchored])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    onAnchoringScroll()
  }, [onAnchoringScroll])

  const rowActions = useMemo<NativeChatTimelineRowActions>(
    () => ({
      onToggle: toggle,
      onLinkClick,
      allowFileUriLinks,
      ...(failedDeliveryMessageIds ? { failedDeliveryMessageIds } : {}),
      ...(onRetry ? { onRetry } : {})
    }),
    [toggle, onLinkClick, allowFileUriLinks, failedDeliveryMessageIds, onRetry]
  )

  // Enter anchoring when a user message lands at the tail (real send or
  // optimistic echo) — but not for the tail of a freshly opened conversation.
  const tailUserRef = useRef<{ id: string; source: string; text: string } | null>(null)
  const openedSessionRef = useRef<string | null | undefined>(undefined)
  useLayoutEffect(() => {
    const tail = messages.at(-1)
    const tailUser =
      tail?.role === 'user'
        ? { id: tail.id, source: tail.source, text: nativeChatMessageText(tail) }
        : null
    const freshSession = openedSessionRef.current !== sessionId
    openedSessionRef.current = sessionId
    if (freshSession) {
      tailUserRef.current = tailUser
      scrollToEnd()
      return
    }
    if (tailUser && tailUser.id !== tailUserRef.current?.id) {
      // An optimistic echo swapping to its transcript identity is the same
      // send, not a new one — re-running the anchor scroll would yank a
      // reader who has since moved.
      const isEchoSwap =
        tailUserRef.current?.source === 'scrape' && tailUserRef.current.text === tailUser.text
      if (!isEchoSwap) {
        anchorToMessage(tailUser.id)
      }
    }
    tailUserRef.current = tailUser ?? tailUserRef.current
  }, [messages, sessionId, anchorToMessage, scrollToEnd])

  // Re-assert the active scroll mode when rows change. Layout effect so the
  // adjustment happens before paint (no flicker). When an older page just
  // prepended, restore the prior position instead.
  const wasLoadingEarlierRef = useRef(false)
  useLayoutEffect(() => {
    const el = scrollRef.current
    // Consume the anchor only on the commit where the page actually landed
    // (loadingEarlier flips off) — a live append arriving mid-load, or a load
    // that never started, must not spend it on the wrong height delta.
    const pageLanded = wasLoadingEarlierRef.current && !loadingEarlier
    wasLoadingEarlierRef.current = loadingEarlier
    if (el && prependAnchorRef.current && pageLanded) {
      // Preserve the viewport: shift scrollTop by however much taller the content
      // got, so the message the user was reading stays put.
      const grew = el.scrollHeight - prependAnchorRef.current.scrollHeight
      el.scrollTop = prependAnchorRef.current.scrollTop + grew
      prependAnchorRef.current = null
      return
    }
    if (!loadingEarlier) {
      // Stale capture from a load that aborted before setting loadingEarlier.
      prependAnchorRef.current = null
    }
    maintainAfterRender()
  }, [rows.length, isWorking, showWorkingRow, loadingEarlier, maintainAfterRender])

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onWheel={anchoring.onWheel}
        onKeyDown={anchoring.onKeyDown}
        onPointerDown={anchoring.onPointerDown}
        {...{ [NATIVE_CHAT_SCROLL_CONTAINER_ATTR]: 'true' }}
        className="scrollbar-sleek h-full overflow-y-auto px-3 pt-10 pb-4 sm:px-4"
      >
        <div
          ref={contentRef}
          // Why: same max width as the composer column; horizontal inset comes
          // from the scroll container so content aligns with the composer field.
          className="mx-auto flex w-full max-w-3xl flex-col gap-5"
          // Why: `zoom` scales the chat transcript's text and layout together,
          // scoped to this container so the rest of the app is untouched. It's
          // the desktop analog of the mobile pinch-zoom (Chromium/Electron only).
          // overflow-anchor is ours to manage — the browser's native anchoring
          // fights the three-mode scroll model.
          style={{ zoom: fontScale, overflowAnchor: 'none' }}
        >
          {hasMore && loadingEarlier ? (
            <div className="flex justify-center py-1 text-xs text-muted-foreground">
              {translate('components.native-chat.loadingEarlier', 'Loading…')}
            </div>
          ) : null}
          {rows.map((row) => (
            <NativeChatTimelineRowView key={row.key} row={row} actions={rowActions} />
          ))}
          {showWorkingRow ? (
            <NativeChatWorkingRow workingSince={workingSince} activeStepLabel={workingStepLabel} />
          ) : null}
          {/* Reserved end space while a new turn is anchored; height is written
              imperatively by the anchoring hook. */}
          <div ref={spacerRef} aria-hidden className="w-full shrink-0" />
        </div>
      </div>
      {anchoring.showJumpToLatest ? (
        <button
          type="button"
          onClick={scrollToEnd}
          aria-label={translate('components.native-chat.jumpToLatest', 'Jump to latest')}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDown className="size-3.5" />
          <span>{translate('components.native-chat.jumpToLatest', 'Jump to latest')}</span>
        </button>
      ) : null}
    </div>
  )
}
