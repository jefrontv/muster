// A draft's text as a quoted preview: three lines, with Show more when it runs longer.
import type React from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

export function BotsCommentDraftBody({ text }: { text: string }): React.JSX.Element {
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || expanded || typeof ResizeObserver === 'undefined') {
      return
    }
    const measure = (): void => setOverflows(element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text, expanded])

  return (
    <div className="border-l-2 border-border pl-3">
      {/* Collapsed, paragraph gaps fold so a blank line never spends one of the three lines. */}
      <p
        ref={ref}
        className={cn(
          'text-[13px] leading-5 whitespace-pre-line text-foreground',
          !expanded && 'line-clamp-3'
        )}
      >
        {expanded ? text : text.replace(/\n{2,}/g, '\n')}
      </p>
      {overflows || expanded ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="mt-1 rounded-sm text-xs text-chat-ink-tertiary outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {expanded
            ? translate('auto.components.bots.commentDrafts.showLess', 'Show less')
            : translate('auto.components.bots.commentDrafts.showMore', 'Show more')}
        </button>
      ) : null}
    </div>
  )
}
