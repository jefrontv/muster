import { useEffect, useRef } from 'react'
import { translate } from '@/i18n/i18n'
import { formatNativeChatWorkingElapsed } from './native-chat-duration-format'

/** Live "Working for 12s" elapsed label. Self-ticking DOM write (setInterval →
 *  textContent), NOT React state: a state tick would re-commit the whole list
 *  every second for the length of a working turn. */
function WorkingElapsed({ since }: { since: number }): React.JSX.Element {
  const textRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    const update = (): void => {
      if (textRef.current) {
        textRef.current.textContent = formatNativeChatWorkingElapsed(Date.now() - since)
      }
    }
    update()
    const id = window.setInterval(update, 1_000)
    return () => window.clearInterval(id)
  }, [since])
  return (
    <span ref={textRef} className="tabular-nums">
      {formatNativeChatWorkingElapsed(Date.now() - since)}
    </span>
  )
}

/** The timeline's working indicator: three duty-cycled pulsing dots plus the
 *  live elapsed. Shown while the agent works and no streaming bubble has
 *  replaced it. */
export function NativeChatWorkingRow({
  workingSince
}: {
  /** Epoch ms when the working state began, or null when unknown. */
  workingSince: number | null
}): React.JSX.Element {
  return (
    <div
      className="flex min-w-0 items-center gap-2 py-1 text-xs text-muted-foreground"
      aria-label={translate('components.native-chat.status.responding', 'Agent is responding')}
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-[3px]">
        <span className="size-1 animate-native-chat-status-pulse rounded-full bg-muted-foreground/70" />
        <span className="size-1 animate-native-chat-status-pulse rounded-full bg-muted-foreground/70 [animation-delay:200ms]" />
        <span className="size-1 animate-native-chat-status-pulse rounded-full bg-muted-foreground/70 [animation-delay:400ms]" />
      </span>
      {workingSince !== null ? (
        // aria-hidden: the ticking timer inside this aria-live row would
        // otherwise be announced every second.
        <span className="shrink-0" aria-hidden>
          {translate('components.native-chat.status.workingFor', 'Working for')}{' '}
          <WorkingElapsed since={workingSince} />
        </span>
      ) : (
        <span className="shrink-0">
          {translate('components.native-chat.status.working', 'Working…')}
        </span>
      )}
    </div>
  )
}
