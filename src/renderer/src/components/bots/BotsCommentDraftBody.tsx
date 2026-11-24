// A draft's text: clamped to a few lines, or in full; a list row expands on click, a card offers Show more.
import type React from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

const CLAMP: Record<number, string> = { 2: 'line-clamp-2', 3: 'line-clamp-3' }

export function BotsCommentDraftBody({
  text,
  lines,
  onExpand
}: {
  text: string
  /** Null shows the whole text. */
  lines: 2 | 3 | null
  /** Set by a collapsed list row: clicking the preview opens the row instead of Show more. */
  onExpand?: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLParagraphElement>(null)
  const [more, setMore] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const clamped = lines !== null && !more

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || !clamped || onExpand || typeof ResizeObserver === 'undefined') {
      return
    }
    const measure = (): void => setOverflows(element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text, clamped, onExpand])

  return (
    <div>
      {/* A row preview runs paragraphs together; a clamped card folds blank lines so none spends a line. */}
      <p
        ref={ref}
        onClick={onExpand}
        className={cn(
          'text-[13px] leading-5 whitespace-pre-line text-chat-ink-secondary',
          clamped && lines !== null && CLAMP[lines],
          onExpand && 'cursor-pointer'
        )}
      >
        {onExpand ? text.replace(/\s+/g, ' ') : clamped ? text.replace(/\n{2,}/g, '\n') : text}
      </p>
      {!onExpand && (overflows || more) ? (
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((open) => !open)}
          className="mt-0.5 rounded-sm text-xs text-chat-ink-tertiary outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {more
            ? translate('auto.components.bots.commentDrafts.showLess', 'Show less')
            : translate('auto.components.bots.commentDrafts.showMore', 'Show more')}
        </button>
      ) : null}
    </div>
  )
}
