// A minimap rail on the transcript's right edge: one tick per turn. Hover or
// focus previews the turn; a click jumps to it. Only visible ticks render.

import { memo, useEffect, useRef, useState } from 'react'
import type React from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { unwrapChatWorkspaceUserTurn } from '../../../../shared/chat-workspace-site-info'
import { answerText } from './chat-turn-layout'
import { railScrollFor, TICK_PX, tickWindow } from './chat-turn-navigator-model'
import { useChatEngineTurn } from './use-chat-engine-thread'

const RAIL_MAX_PX = 420

const TurnPreview = memo(function TurnPreview(props: {
  threadId: string
  turnId: string
  top: number
}): React.JSX.Element | null {
  const turn = useChatEngineTurn(props.threadId, props.turnId)
  if (!turn) {
    return null
  }
  const prompt = turn.user ? unwrapChatWorkspaceUserTurn(turn.user.text) : ''
  const response = answerText(turn.items)
  return (
    <div
      aria-hidden
      style={{ top: props.top }}
      className="pointer-events-none absolute right-full mr-2 max-h-[100px] w-[min(300px,calc(100cqw-120px))] -translate-y-1/2 overflow-hidden rounded-xl bg-popover px-3 py-2.5 shadow-chat-soft transition-[top] duration-140 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
    >
      {prompt && <div className="truncate text-[13px] font-medium text-foreground">{prompt}</div>}
      {response && <div className="line-clamp-3 text-xs text-chat-ink-tertiary">{response}</div>}
    </div>
  )
})

export function ChatTurnNavigator(props: {
  threadId: string
  order: string[]
  /** Turns currently rendered by paging; the rest draw as faint ticks. */
  rendered: ReadonlySet<string>
  activeIndex: number
  busyTurnId: string | null
  bandHeight: number
  onJump: (turnId: string) => void
}): React.JSX.Element | null {
  const { order, activeIndex } = props
  const railRef = useRef<HTMLDivElement | null>(null)
  const [railTop, setRailTop] = useState(0)
  const [preview, setPreview] = useState<number | null>(null)
  const railHeight = Math.max(
    0,
    Math.min(props.bandHeight - 64, RAIL_MAX_PX, order.length * TICK_PX)
  )

  useEffect(() => {
    const rail = railRef.current
    if (!rail) {
      return
    }
    const next = railScrollFor(activeIndex, rail.scrollTop, railHeight)
    if (next !== null) {
      rail.scrollTop = next
      // Scroll events fire on the next frame; the tick window should not wait for it.
      setRailTop(rail.scrollTop)
    }
  }, [activeIndex, railHeight])

  if (order.length < 2 || railHeight <= 0) {
    return null
  }
  const { start, end } = tickWindow(railTop, railHeight, order.length)
  const ticks: React.JSX.Element[] = []
  for (let index = start; index < end; index++) {
    const turnId = order[index]!
    const active = index === activeIndex
    ticks.push(
      <button
        key={turnId}
        type="button"
        aria-label={translate('components.chat-thread.jumpToTurn', 'Go to message {{number}}', {
          number: index + 1
        })}
        aria-current={active ? 'true' : undefined}
        onClick={() => props.onJump(turnId)}
        onPointerEnter={() => setPreview(index)}
        onFocus={() => setPreview(index)}
        style={{ top: index * TICK_PX }}
        className={cn(
          'group/tick absolute right-0 h-[10px] w-7 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ring',
          // The bar scales from its right edge, so ticks grow toward the content.
          'before:absolute before:right-0 before:top-1/2 before:h-0.5 before:w-5 before:-translate-y-1/2 before:origin-right before:rounded-[2px] before:transition-[transform,background-color] before:duration-140 motion-reduce:before:transition-none',
          active
            ? 'before:scale-x-100 before:bg-foreground'
            : props.rendered.has(turnId)
              ? 'before:scale-x-60 before:bg-border hover:before:scale-x-90 hover:before:bg-chat-ink-tertiary'
              : 'before:scale-x-40 before:bg-border before:opacity-60 hover:before:scale-x-90 hover:before:bg-chat-ink-tertiary hover:before:opacity-100',
          turnId === props.busyTurnId && 'before:animate-pulse motion-reduce:before:animate-none',
          'focus-visible:before:scale-x-100 focus-visible:before:bg-ring'
        )}
      />
    )
  }
  const previewTop =
    preview === null ? 0 : preview * TICK_PX + TICK_PX / 2 - (railRef.current?.scrollTop ?? railTop)
  return (
    <nav
      aria-label={translate('components.chat-thread.navigator', 'Messages')}
      className="pointer-events-auto relative w-7"
      style={{ height: railHeight }}
      onPointerLeave={() => setPreview(null)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPreview(null)
        }
      }}
    >
      <div
        ref={railRef}
        onScroll={(event) => setRailTop(event.currentTarget.scrollTop)}
        className="scrollbar-none h-full overflow-y-auto overscroll-contain"
      >
        <div className="relative" style={{ height: order.length * TICK_PX }}>
          {ticks}
        </div>
      </div>
      {preview !== null && order[preview] && (
        <TurnPreview threadId={props.threadId} turnId={order[preview]!} top={previewTop} />
      )}
    </nav>
  )
}
