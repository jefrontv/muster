// A failed turn, inline at its end: plain copy, Retry, and the raw CLI text
// behind Details. Replaces the banner that sat far from the turn it described.

import { useState } from 'react'
import { ChevronRight, RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { chatThreadTurnErrorCopy } from '@/components/chat-mode/chat-thread-turn-error-copy'

export function NativeChatTurnErrorRow({
  message,
  onRetry
}: {
  message: string
  onRetry?: () => void
}): React.JSX.Element {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const copy = chatThreadTurnErrorCopy(message)
  const hasDetails = copy.details !== null && copy.details !== copy.summary
  return (
    <div role="alert" className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
        <span className="text-foreground/85">{copy.summary}</span>
        {onRetry ? (
          <Button size="xs" variant="ghost" onClick={onRetry}>
            <RotateCcw />
            {translate('components.native-chat.reply.retry', 'Retry')}
          </Button>
        ) : null}
        {hasDetails ? (
          <button
            type="button"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
            className="flex items-center gap-0.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform', detailsOpen && 'rotate-90')}
            />
            {translate('components.native-chat.reply.details', 'Details')}
          </button>
        ) : null}
      </div>
      {hasDetails && detailsOpen ? (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 font-mono text-[11px] text-muted-foreground scrollbar-sleek">
          {copy.details}
        </pre>
      ) : null}
    </div>
  )
}
