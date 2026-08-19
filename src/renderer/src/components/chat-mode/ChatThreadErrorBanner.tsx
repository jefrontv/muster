// Shows the failure the CLI reported for the last turn.
//
// Why it exists: main decodes `isError`/`errorMessage` off the result record
// and puts them on the wire, and until now nothing in the renderer read either
// one — a turn that failed rendered exactly like one that succeeded.
//
// Dismissal is keyed on thread + message, following t3code's ThreadErrorBanner:
// dismissing one failure must not silence the *next*, different one.

import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export function ChatThreadErrorBanner({
  threadId,
  message
}: {
  threadId: string
  message: string | null
}): React.JSX.Element | null {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  if (message === null) {
    return null
  }
  const key = `${threadId}:${message}`
  if (dismissedKey === key) {
    return null
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2"
    >
      <AlertTriangle className="mt-[2px] size-3.5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-destructive">
          {translate('components.chat-mode.turnError.title', "That didn't finish")}
        </p>
        {/* Clamped: some CLI failures are a wall of text. */}
        <p className="line-clamp-3 break-words text-xs text-muted-foreground" title={message}>
          {message}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={translate('components.chat-mode.turnError.dismiss', 'Dismiss')}
        onClick={() => setDismissedKey(key)}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
