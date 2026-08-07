import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import type { NativeChatLiveSession } from './use-native-chat-live-session'
import { orderNativeChatMessages } from './native-chat-message-grouping'
import { stripNoiseMessages } from './native-chat-noise'
import { foldToolMessages } from './native-chat-tool-fold'
import { buildNativeChatTimelineRows } from './native-chat-timeline-rows'
import { nativeChatMessageText } from './native-chat-turn-folds'
import { useNativeChatScrollAnchoring } from './use-native-chat-scroll-anchoring'
import { NATIVE_CHAT_SCROLL_CONTAINER_ATTR } from './use-native-chat-toggle-scroll-compensation'
import { NativeChatMessageRow } from './NativeChatMessageRow'
import { NativeChatTurnFoldRow, NativeChatLiveToolToggleRow } from './NativeChatTurnFoldRow'
import { NativeChatWorkingRow } from './NativeChatWorkingRow'
import { NATIVE_CHAT_STREAMING_ID } from '../../../../shared/native-chat-streaming'

function toggled(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  return next
}

export function NativeChatMessageList({
  session,
  isWorking,
  expandSignal,
  fontScale,
  onLinkClick,
  allowFileUriLinks = false,
  failedDeliveryMessageIds,
  workingSince = null
}: {
  session: NativeChatLiveSession
  isWorking: boolean
  /** Toolbar-driven desired open state for every tool run; each flip re-syncs. */
  expandSignal: boolean
  /** Chat-only text multiplier (1 = default), driven by the zoom shortcuts. */
  fontScale: number
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
  failedDeliveryMessageIds?: ReadonlySet<string>
  /** Epoch ms the current working state began (drives "Working for {t}"). */
  workingSince?: number | null
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const spacerRef = useRef<HTMLDivElement | null>(null)

  const { hasMore, loadingEarlier, loadEarlier, sessionId } = session

  // Strip harness noise (task-notifications, system reminders, slash-command
  // envelopes) before folding so they don't render as the user's own bubbles —
  // matching the mobile chat. Then fold each turn's tool activity into the
  // assistant message it belongs to, ordered stably, so a turn's tools collapse
  // under one run.
  const messages = useMemo(
    () => foldToolMessages(orderNativeChatMessages(stripNoiseMessages(session.messages))),
    [session.messages]
  )
  const showWorkingRow =
    isWorking && !messages.some((message) => message.id === NATIVE_CHAT_STREAMING_ID)

  // Settled turns the user re-opened / running turns with tool overflow shown.
  const [expandedTurnIds, setExpandedTurnIds] = useState<ReadonlySet<string>>(new Set())
  const [expandedLiveToolTurnIds, setExpandedLiveToolTurnIds] = useState<ReadonlySet<string>>(
    new Set()
  )
  const rows = useMemo(
    () =>
      buildNativeChatTimelineRows({
        messages,
        isWorking,
        expandedTurnIds,
        expandedLiveToolTurnIds
      }),
    [messages, isWorking, expandedTurnIds, expandedLiveToolTurnIds]
  )

  // An interrupt that lands while this list is mounted leaves its turn
  // expanded (the user just stopped it — hiding the evidence reads as loss);
  // interrupted turns from history stay collapsed like any settled turn.
  const seenInterruptedTurnIdsRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    const interrupted = rows.flatMap((row) =>
      row.kind === 'turn-fold' && row.interrupted ? [row.turnId] : []
    )
    const seen = seenInterruptedTurnIdsRef.current
    if (seen === null) {
      seenInterruptedTurnIdsRef.current = new Set(interrupted)
      return
    }
    const fresh = interrupted.filter((turnId) => !seen.has(turnId))
    if (fresh.length > 0) {
      fresh.forEach((turnId) => seen.add(turnId))
      setExpandedTurnIds((prev) => new Set([...prev, ...fresh]))
    }
  }, [rows])

  const anchoring = useNativeChatScrollAnchoring({ scrollRef, contentRef, spacerRef, isWorking })
  const {
    anchorToMessage,
    scrollToEnd,
    maintainAfterRender,
    breakToFreeScrolling,
    onScroll: onAnchoringScroll
  } = anchoring

  // When an older page prepends, the scroll content grows above the viewport.
  // Capture the pre-render scroll height so the layout effect can restore the
  // user's position (no jump) instead of letting the browser keep scrollTop.
  const prependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    onAnchoringScroll()
    // Near the top — page in older history, anchoring the current position so the
    // prepend doesn't yank the view.
    if (el.scrollTop < 80 && hasMore && !loadingEarlier) {
      prependAnchorRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop }
      loadEarlier()
    }
  }, [onAnchoringScroll, hasMore, loadingEarlier, loadEarlier])

  // Align a single message's top to the top of the scroll viewport.
  const scrollMessageToTop = useCallback(
    (el: HTMLElement) => {
      const container = scrollRef.current
      if (!container) {
        return
      }
      // Detach synchronously so an in-place streaming growth can't re-pin to
      // the bottom mid-flight and fight this deliberate scroll.
      breakToFreeScrolling()
      const delta = el.getBoundingClientRect().top - container.getBoundingClientRect().top
      container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' })
    },
    [breakToFreeScrolling]
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
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && prependAnchorRef.current) {
      // Preserve the viewport: shift scrollTop by however much taller the content
      // got, so the message the user was reading stays put.
      const grew = el.scrollHeight - prependAnchorRef.current.scrollHeight
      el.scrollTop = prependAnchorRef.current.scrollTop + grew
      prependAnchorRef.current = null
      return
    }
    maintainAfterRender()
  }, [rows.length, isWorking, showWorkingRow, maintainAfterRender])

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
          className="mx-auto flex w-full max-w-4xl flex-col gap-5"
          // Why: `zoom` scales the chat transcript's text and layout together,
          // scoped to this container so the rest of the app is untouched. It's
          // the desktop analog of the mobile pinch-zoom (Chromium/Electron only).
          // overflow-anchor is ours to manage — the browser's native anchoring
          // fights the three-mode scroll model.
          style={{ zoom: fontScale, overflowAnchor: 'none' }}
        >
          {hasMore ? (
            <div className="flex justify-center py-1">
              <button
                type="button"
                onClick={loadEarlier}
                disabled={loadingEarlier}
                className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                {loadingEarlier
                  ? translate('components.native-chat.loadingEarlier', 'Loading…')
                  : translate('components.native-chat.loadEarlier', 'Load earlier messages')}
              </button>
            </div>
          ) : null}
          {rows.map((row) =>
            row.kind === 'message' ? (
              <NativeChatMessageRow
                key={row.message.id}
                message={row.message}
                expandSignal={expandSignal}
                suppressTools={row.suppressTools}
                onScrollMessageToTop={scrollMessageToTop}
                onLinkClick={onLinkClick}
                allowFileUriLinks={allowFileUriLinks}
                deliveryFailed={failedDeliveryMessageIds?.has(row.message.id) === true}
              />
            ) : row.kind === 'turn-fold' ? (
              <NativeChatTurnFoldRow
                key={`turn-fold:${row.turnId}`}
                durationMs={row.durationMs}
                interrupted={row.interrupted}
                expanded={row.expanded}
                onToggle={() => setExpandedTurnIds((prev) => toggled(prev, row.turnId))}
              />
            ) : (
              <NativeChatLiveToolToggleRow
                key={`live-tools:${row.turnId}`}
                hiddenCount={row.hiddenCount}
                expanded={row.expanded}
                onToggle={() => setExpandedLiveToolTurnIds((prev) => toggled(prev, row.turnId))}
              />
            )
          )}
          {showWorkingRow ? <NativeChatWorkingRow workingSince={workingSince} /> : null}
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
