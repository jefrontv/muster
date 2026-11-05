// Ported from the muster-bots fork (src/components/TurnPresence.tsx), Apache-2.0.
// A running turn's status line: "Working · 1m 12s · Reading notes.txt", with the
// last few steps a click away. It steps aside once the answer starts streaming.

import { useEffect, useId, useRef, useState } from 'react'
import type React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { AgentWorkingSpinner } from '@/components/AgentWorkingSpinner'
import type { ChatEngineTurn } from '../../../../shared/chat-engine-types'
import { formatElapsed } from '@/components/chat-thread/chat-tool-row-model'
import { phraseAt, phraseHoldMs, turnNowPhrases } from './chat-turn-phrases'
import { ChatNowCard, nowSteps } from './ChatNowCard'

const FADE_MS = 320

/** Rotates through `phrases`, restarting at the lead whenever `phase` changes. */
export function useRotatingPhrase(
  phrases: readonly string[],
  phase: string,
  active: boolean
): { current: string; fading: boolean } {
  const [clock, setClock] = useState({ phase, step: 0 })
  if (clock.phase !== phase) {
    setClock({ phase, step: 0 })
  }
  const step = clock.phase === phase ? clock.step : 0
  const current = phraseAt(phrases, phase, step)
  const [fading, setFading] = useState(false)
  const shown = useRef(current)

  useEffect(() => {
    if (!active || phrases.length < 2) {
      return
    }
    const timer = window.setTimeout(
      () => setClock({ phase, step: step + 1 }),
      phraseHoldMs(phase, step)
    )
    return () => window.clearTimeout(timer)
  }, [active, phrases.length, phase, step])

  useEffect(() => {
    if (shown.current === current) {
      return
    }
    shown.current = current
    setFading(true)
    const timer = window.setTimeout(() => setFading(false), FADE_MS)
    return () => window.clearTimeout(timer)
  }, [current])

  return { current, fading }
}

function useElapsedSeconds(since: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return Math.max(0, Math.floor((now - since) / 1000))
}

const Dot = (): React.JSX.Element => (
  // The spaces keep copied text readable; the gap does the spacing on screen.
  <span aria-hidden className="text-chat-ink-tertiary">
    {' · '}
  </span>
)

export function ChatTurnPresence(props: {
  turn: Pick<ChatEngineTurn, 'id' | 'items' | 'startedAt'>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const cardId = useId()
  const statusId = useId()
  const now = turnNowPhrases(props.turn)
  const { current, fading } = useRotatingPhrase(now.phrases, now.phase, true)
  const seconds = useElapsedSeconds(props.turn.startedAt)
  const steps = nowSteps(props.turn.items)

  useEffect(() => {
    if (!open) {
      return
    }
    const fold = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return
      }
      const inside = Boolean(root.current?.contains(document.activeElement))
      if (!inside && document.activeElement && document.activeElement !== document.body) {
        return
      }
      event.preventDefault()
      setOpen(false)
      if (inside) {
        toggle.current?.focus()
      }
    }
    document.addEventListener('keydown', fold)
    return () => document.removeEventListener('keydown', fold)
  }, [open])

  const status = (
    <span
      id={statusId}
      data-turn-status=""
      className="flex min-w-0 items-baseline gap-x-1.5 text-[13px] leading-5"
    >
      <span className="shrink-0 text-chat-ink-secondary">
        {translate('components.chat-conversation.presence.working', 'Working')}
      </span>
      <Dot />
      <span className="shrink-0 font-mono text-xs tabular-nums text-chat-ink-tertiary">
        {formatElapsed(seconds)}
      </span>
      <Dot />
      <span
        key={current}
        title={now.hover}
        data-turn-now=""
        className={cn(
          'chat-shimmer min-w-0 truncate text-chat-ink-secondary',
          fading && 'animate-in fade-in duration-300 motion-reduce:animate-none'
        )}
      >
        {current}
      </span>
    </span>
  )

  return (
    <div ref={root} className="flex min-w-0 max-w-full flex-col items-start gap-2" aria-live="off">
      <div className="flex min-w-0 max-w-full items-center gap-2">
        <AgentWorkingSpinner className="size-3.5 shrink-0 text-chat-ink-secondary" />
        {steps.length > 0 ? (
          <button
            ref={toggle}
            type="button"
            aria-expanded={open}
            aria-controls={open ? cardId : undefined}
            aria-describedby={statusId}
            aria-label={translate(
              'components.chat-conversation.presence.recentSteps',
              'Recent steps'
            )}
            onClick={() => setOpen((shown) => !shown)}
            className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full px-1.5 py-0.5 -mx-1.5 transition-colors duration-100 ease-chat hover:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent motion-reduce:transition-none"
          >
            {status}
            <ChevronDown
              className={cn(
                'size-3 shrink-0 text-chat-ink-tertiary transition-transform duration-100 ease-chat motion-reduce:transition-none',
                open && 'rotate-180'
              )}
              aria-hidden
            />
          </button>
        ) : (
          status
        )}
      </div>
      {open && steps.length > 0 && (
        <div
          id={cardId}
          role="region"
          aria-label={translate(
            'components.chat-conversation.presence.recentSteps',
            'Recent steps'
          )}
        >
          <ChatNowCard steps={steps} />
        </div>
      )}
    </div>
  )
}
