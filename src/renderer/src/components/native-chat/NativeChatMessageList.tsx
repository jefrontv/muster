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
import { NativeChatVirtualRows, nativeChatVirtualSplit } from './NativeChatVirtualRows'
import { NATIVE_CHAT_ROW_ANCHOR_ATTR, nativeChatRowAnchorId } from './native-chat-row-anchor'
import { useNativeChatRowAnchor } from './use-native-chat-row-anchor'

/** Start the next page this far before the top of history comes into view. */
const LOAD_EARLIER_MARGIN_PX = 600

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
  const topSentinelRef = useRef<HTMLDivElement | null>(null)

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
    getMode,
    onScroll: onAnchoringScroll
  } = anchoring

  // Prepends, the loading row and windowed-row measurements shift content above
  // the reader; the row anchor puts it back. Following the end pins the bottom instead.
  const rowAnchor = useNativeChatRowAnchor({
    scrollRef,
    contentRef,
    isActive: useCallback(() => getMode() !== 'following-end', [getMode])
  })
  const { capture: captureRowAnchor, correct: correctRowAnchor } = rowAnchor

  const loadEarlierAnchored = useCallback(() => {
    captureRowAnchor()
    loadEarlier()
  }, [captureRowAnchor, loadEarlier])

  // Older pages load when the reader nears the top, not in a loop on open. The
  // observer is rebuilt after each page so a still-visible sentinel asks again.
  useEffect(() => {
    const sentinel = topSentinelRef.current
    const root = scrollRef.current
    if (
      !hasMore ||
      loadingEarlier ||
      !sentinel ||
      !root ||
      typeof IntersectionObserver !== 'function'
    ) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          loadEarlierAnchored()
        }
      },
      { root, rootMargin: `${LOAD_EARLIER_MARGIN_PX}px 0px 0px 0px` }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingEarlier, loadEarlierAnchored])

  const split = nativeChatVirtualSplit(rows.length)
  const headRows = useMemo(() => rows.slice(0, split), [rows, split])
  const tailRows = split > 0 ? rows.slice(split) : rows

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    onAnchoringScroll()
    captureRowAnchor()
  }, [onAnchoringScroll, captureRowAnchor])

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

  // Before paint: put the anchored row back first, then re-assert the scroll mode.
  useLayoutEffect(() => {
    correctRowAnchor()
    maintainAfterRender()
  }, [
    rows,
    isWorking,
    showWorkingRow,
    loadingEarlier,
    fontScale,
    correctRowAnchor,
    maintainAfterRender
  ])

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
          // Why: same max width as the composer column (scaled with the zoom);
          // horizontal inset comes from the scroll container so content aligns
          // with the composer field. overflow-anchor is ours to manage — the
          // browser's native anchoring fights the three-mode scroll model.
          className="mx-auto w-full"
          style={{ maxWidth: `${48 * fontScale}rem`, overflowAnchor: 'none' }}
        >
          <div ref={topSentinelRef} aria-hidden className="h-px w-full" />
          {hasMore && loadingEarlier ? (
            <div className="flex justify-center py-1 text-xs text-muted-foreground">
              {translate('components.native-chat.loadingEarlier', 'Loading…')}
            </div>
          ) : null}
          <NativeChatVirtualRows
            rows={headRows}
            actions={rowActions}
            scrollRef={scrollRef}
            fontScale={fontScale}
            locatorRef={rowAnchor.locatorRef}
            onLayout={correctRowAnchor}
          />
          {/* Why: `zoom` scales the transcript's text and layout together, scoped
              here so the rest of the app is untouched (the desktop analog of the
              mobile pinch-zoom; Chromium/Electron only). */}
          <div className="flex flex-col gap-5" style={{ zoom: fontScale }}>
            {tailRows.map((row) => (
              // empty:hidden: a row that renders nothing adds no gap.
              <div
                key={row.key}
                className="empty:hidden"
                {...{ [NATIVE_CHAT_ROW_ANCHOR_ATTR]: nativeChatRowAnchorId(row) }}
              >
                <NativeChatTimelineRowView row={row} actions={rowActions} />
              </div>
            ))}
            {showWorkingRow ? (
              <NativeChatWorkingRow
                workingSince={workingSince}
                activeStepLabel={workingStepLabel}
              />
            ) : null}
          </div>
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
