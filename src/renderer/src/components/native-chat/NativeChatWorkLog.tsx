// A turn's single work log. Settled, it folds behind named counts ("Edited 2
// files, ran 3 commands"); live in Code mode it stays open with the newest row
// at the bottom; live in Chat mode the status line below speaks for it.

import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  countWorkActivities,
  describeWorkFailures,
  describeWorkFold
} from '../../../../shared/native-chat-work-summary'
import type { NativeChatTurnWork } from './native-chat-turn-work'
import type { NativeChatWorkLogPresentation } from './native-chat-timeline-rows'
import { formatNativeChatDuration } from './native-chat-duration-format'
import { useNativeChatSurface } from './native-chat-surface-context'
import { useNativeChatToggleScrollCompensation } from './use-native-chat-toggle-scroll-compensation'
import { NativeChatWorkRow } from './NativeChatWorkRow'
import { NativeChatActiveCollabEventChip } from './NativeChatActiveCollabEventChip'

function headerLabel(args: {
  work: NativeChatTurnWork
  interrupted: boolean
  durationMs: number | null
  surface: 'chat' | 'code'
}): string {
  const duration = args.durationMs !== null ? formatNativeChatDuration(args.durationMs) : null
  if (args.interrupted) {
    return duration
      ? translate(
          'components.native-chat.turnFold.stoppedAfter',
          'You stopped after {{duration}}',
          {
            duration
          }
        )
      : translate('components.native-chat.turnFold.stopped', 'You stopped this response')
  }
  const counts = countWorkActivities(args.work.activities)
  return (
    describeWorkFold(counts, args.surface, translate) ??
    (args.work.entries.some((entry) => entry.kind === 'thinking')
      ? translate('components.native-chat.activity.thought', 'Thought')
      : translate('components.native-chat.turnFold.worked', 'Worked'))
  )
}

export function NativeChatWorkLog({
  work,
  presentation,
  live,
  durationMs,
  interrupted,
  onToggle
}: {
  work: NativeChatTurnWork
  presentation: NativeChatWorkLogPresentation
  live: boolean
  durationMs: number | null
  interrupted: boolean
  onToggle: () => void
}): React.JSX.Element | null {
  const { surface } = useNativeChatSurface()
  const open = presentation === 'open'
  const { elementRef, captureBeforeToggle } = useNativeChatToggleScrollCompensation(open)
  const label = useMemo(
    () => headerLabel({ work, interrupted, durationMs, surface }),
    [work, interrupted, durationMs, surface]
  )
  const failures = useMemo(
    () => describeWorkFailures(countWorkActivities(work.activities), translate),
    [work.activities]
  )
  const chips =
    work.events.length > 0 ? (
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {work.events.map((event, index) => (
          <NativeChatActiveCollabEventChip key={index} event={event} />
        ))}
      </div>
    ) : null
  if (presentation === 'hidden') {
    return chips
  }
  const expandable = work.entries.length > 0
  return (
    <div ref={elementRef}>
      <button
        type="button"
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
        onClick={() => {
          captureBeforeToggle()
          onToggle()
        }}
        className="group flex w-full min-w-0 items-center gap-1.5 rounded-sm py-0.5 text-left text-xs text-muted-foreground transition-colors enabled:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {expandable ? (
          <ChevronRight
            className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
          />
        ) : null}
        <span className="min-w-0 truncate">{label}</span>
        {failures ? <span className="shrink-0 text-destructive/80">{failures}</span> : null}
        {!live && !interrupted && durationMs !== null ? (
          <span className="shrink-0 tabular-nums text-muted-foreground/70">
            {formatNativeChatDuration(durationMs)}
          </span>
        ) : null}
      </button>
      {open && expandable ? (
        <div className="ml-[7px] mt-0.5 space-y-0.5 border-l border-border/60 pl-3">
          {work.entries.map((entry) => (
            <NativeChatWorkRow key={entry.key} entry={entry} />
          ))}
        </div>
      ) : null}
      {chips}
    </div>
  )
}
