import { useId, useState } from 'react'
import type React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { CHAT_STACK_VISIBLE_ROWS } from './chat-turn-layout'

/**
 * A long run of one-line steps capped at the last few rows; the step above them
 * folds into a faded sliver and older ones hide until expanded. Rows keep the
 * same wrapper either way, so sliding the window never remounts an open row.
 */
export function ChatProcessStack<T>(props: {
  runs: T[]
  runKey: (run: T) => string
  renderRun: (run: T) => React.ReactNode
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const bodyId = useId()
  const hidden = props.runs.length - CHAT_STACK_VISIBLE_ROWS
  return (
    <div className="flex min-w-0 flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded((open) => !open)}
        className="flex h-(--chat-row-height) items-center gap-1.5 self-start rounded-sm text-[13px] tabular-nums text-chat-ink-tertiary transition-colors duration-100 hover:text-chat-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {expanded
          ? translate('components.chat-thread.stack.showFewer', 'Show fewer steps')
          : translate('components.chat-thread.stack.earlier', '{{count}} earlier steps', {
              count: hidden
            })}
        <ChevronDown
          className={cn('size-3.5 transition-transform duration-100', expanded && 'rotate-180')}
          aria-hidden
        />
      </button>
      <div id={bodyId} className="flex min-w-0 flex-col gap-1.5">
        {props.runs.map((run, index) => {
          const peek = !expanded && index === hidden - 1
          return (
            <div
              key={props.runKey(run)}
              inert={peek || undefined}
              className={cn(
                'min-w-0',
                !expanded && index < hidden - 1 && 'hidden',
                // Bottom half of the row, fading out upward, reads as the next step folded underneath.
                peek &&
                  'flex h-3 flex-col justify-end overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000)]'
              )}
            >
              {props.renderRun(run)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
