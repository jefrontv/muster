// Small SVG donut beside the send button showing context-window fullness.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export const CONTEXT_WINDOW_MAX_TOKENS = 200_000

/** "842", "9.5k", "128k", "1M" — compact enough for a tooltip pair. */
export function formatContextTokens(tokens: number): string {
  const safe = Math.max(0, Math.round(tokens))
  if (safe < 1_000) {
    return String(safe)
  }
  if (safe < 10_000) {
    return `${(safe / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  }
  if (safe < 1_000_000) {
    return `${Math.round(safe / 1_000)}k`
  }
  return `${(safe / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

const RADIUS = 10
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function NativeChatContextWindowMeter({
  usedTokens,
  maxTokens = CONTEXT_WINDOW_MAX_TOKENS
}: {
  usedTokens: number
  maxTokens?: number
}): React.JSX.Element {
  // Never render a contradiction like "307k/200k": when usage outgrows an
  // assumed window (unknown model, stale map), the window is what's wrong.
  const effectiveMax = Math.max(maxTokens, usedTokens)
  const fraction = Math.max(0, Math.min(1, usedTokens / effectiveMax))
  const percent = Math.round(fraction * 100)
  const overloaded = fraction > 0.9
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'flex size-7 items-center justify-center',
            overloaded ? 'text-destructive' : 'text-muted-foreground/50'
          )}
          role="img"
          aria-label={translate(
            'auto.components.native-chat.contextWindow.used',
            'Context window usage'
          )}
        >
          <svg viewBox="0 0 24 24" className="size-5 -rotate-90" aria-hidden="true">
            <circle
              cx="12"
              cy="12"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="3"
            />
            <circle
              cx="12"
              cy="12"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
              className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
            />
          </svg>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="tabular-nums">
        {`${percent}% · ${formatContextTokens(usedTokens)}/${formatContextTokens(effectiveMax)} ${translate(
          'auto.components.native-chat.contextWindow.tokens',
          'tokens'
        )}`}
      </TooltipContent>
    </Tooltip>
  )
}
