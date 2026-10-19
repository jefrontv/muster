import { useEffect, useState } from 'react'
import type React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ChatEngineTurn } from '../../../../shared/chat-engine-types'
import { formatElapsed } from './chat-tool-row-model'

type SettledTurn = Pick<ChatEngineTurn, 'status' | 'durationMs'>

// Stands in for the duration while translating, so the digits can be wrapped after.
const DURATION_SLOT = '\u0001'

/** "Completed in 12s", "Stopped" or "Failed"; digits are flagged so they can be set in mono. */
export function turnOutcomeParts(turn: SettledTurn): { text: string; numeric: boolean }[] {
  if (turn.status === 'interrupted') {
    return [
      { text: translate('components.chat-thread.turnInterrupted', 'Stopped'), numeric: false }
    ]
  }
  if (turn.status === 'error') {
    return [{ text: translate('components.chat-thread.turnFailedLabel', 'Failed'), numeric: false }]
  }
  if (!turn.durationMs) {
    return [{ text: translate('components.chat-thread.completed', 'Completed'), numeric: false }]
  }
  const duration = formatElapsed(turn.durationMs / 1000)
  return translate('components.chat-thread.completedIn', 'Completed in {{duration}}', {
    duration: DURATION_SLOT
  })
    .split(DURATION_SLOT)
    .flatMap((part, index) => [
      ...(index > 0
        ? duration
            .split(/(\d+(?:\.\d+)?)/)
            .filter(Boolean)
            .map((text) => ({ text, numeric: /^\d/.test(text) }))
        : []),
      ...(part ? [{ text: part, numeric: false }] : [])
    ])
}

export const turnOutcomeText = (turn: SettledTurn): string =>
  turnOutcomeParts(turn)
    .map((part) => part.text)
    .join('')

/** Polite announcement for the latest turn; empty while running so settling is what gets read. */
export function TurnOutcomeAnnouncement({ turn }: { turn: SettledTurn }): React.JSX.Element {
  return (
    <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {turn.status === 'running' ? '' : turnOutcomeText(turn)}
    </span>
  )
}

export function FoldHeader(props: {
  turn: SettledTurn
  open: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-expanded={props.open}
      onClick={props.onToggle}
      className="my-1 flex h-[33px] w-full min-w-0 items-center border-b-[0.5px] border-chat-line-2 pb-2 text-left text-sm text-chat-ink-tertiary transition-colors duration-100 ease-chat hover:text-chat-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent"
    >
      <span className="min-w-0 truncate leading-6">
        {turnOutcomeParts(props.turn).map((part, index) =>
          part.numeric ? (
            <span key={index} className="font-mono tabular-nums">
              {part.text}
            </span>
          ) : (
            part.text
          )
        )}
      </span>
      <ChevronDown
        className={cn(
          'ml-1 size-3.5 shrink-0 transition-transform duration-100 ease-chat motion-reduce:transition-none',
          props.open && 'rotate-180'
        )}
        aria-hidden
      />
    </button>
  )
}

function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

export function RunningStatus({ startedAt }: { startedAt: number }): React.JSX.Element {
  const seconds = useElapsedSeconds(startedAt)
  return (
    <div
      className={cn(
        'chat-shimmer self-start text-xs leading-[22px] tabular-nums text-chat-accent',
        // Sweep within the accent family: deeper on light, brighter on dark.
        '[--chat-shimmer-highlight:color-mix(in_srgb,var(--chat-accent)_55%,black)] dark:[--chat-shimmer-highlight:color-mix(in_srgb,var(--chat-accent)_45%,white)]'
      )}
    >
      {translate('components.chat-thread.workingFor', 'Working for {{duration}}', {
        duration: formatElapsed(seconds)
      })}
    </div>
  )
}
