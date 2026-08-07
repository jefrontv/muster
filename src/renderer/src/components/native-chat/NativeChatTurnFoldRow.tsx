import { ChevronDown, ChevronRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { formatNativeChatDuration } from './native-chat-duration-format'
import { useNativeChatToggleScrollCompensation } from './use-native-chat-toggle-scroll-compensation'

function foldLabel(durationMs: number | null, interrupted: boolean): string {
  const duration = durationMs !== null ? formatNativeChatDuration(durationMs) : null
  if (interrupted) {
    return duration
      ? translate('components.native-chat.turnFold.stoppedAfter', `You stopped after ${duration}`, {
          duration
        })
      : translate('components.native-chat.turnFold.stopped', 'You stopped this response')
  }
  return duration
    ? translate('components.native-chat.turnFold.workedFor', `Worked for ${duration}`, {
        duration
      })
    : translate('components.native-chat.turnFold.worked', 'Worked')
}

const QUIET_ROW_CLASS =
  'flex w-full items-center gap-1.5 border-b border-border/40 py-1 text-left text-xs text-muted-foreground tabular-nums transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Settled-turn fold: "Worked for 4m 12s" (or "You stopped after 12s") hiding
 *  the turn's intermediate activity; expands the turn in place. */
export function NativeChatTurnFoldRow({
  durationMs,
  interrupted,
  expanded,
  onToggle
}: {
  durationMs: number | null
  interrupted: boolean
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  const { elementRef, captureBeforeToggle } = useNativeChatToggleScrollCompensation(expanded)
  const Chevron = expanded ? ChevronDown : ChevronRight
  return (
    <div ref={elementRef}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          captureBeforeToggle()
          onToggle()
        }}
        className={QUIET_ROW_CLASS}
      >
        <Chevron className="size-3.5 shrink-0" />
        <span>{foldLabel(durationMs, interrupted)}</span>
      </button>
    </div>
  )
}

/** Running-turn tool overflow: "+N previous tool calls" / "Show fewer". */
export function NativeChatLiveToolToggleRow({
  hiddenCount,
  expanded,
  onToggle
}: {
  hiddenCount: number
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  const { elementRef, captureBeforeToggle } = useNativeChatToggleScrollCompensation(expanded)
  const Chevron = expanded ? ChevronDown : ChevronRight
  const label = expanded
    ? translate('components.native-chat.liveTools.showFewer', 'Show fewer tool calls')
    : translate(
        'components.native-chat.liveTools.showPrevious',
        `+${hiddenCount} previous tool calls`,
        { count: hiddenCount }
      )
  return (
    <div ref={elementRef}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          captureBeforeToggle()
          onToggle()
        }}
        className={QUIET_ROW_CLASS}
      >
        <Chevron className="size-3.5 shrink-0" />
        <span>{label}</span>
      </button>
    </div>
  )
}
