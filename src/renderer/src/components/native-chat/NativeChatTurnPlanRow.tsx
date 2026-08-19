import { Check, ChevronDown, ChevronRight, Circle, Loader } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { NativeChatPlanStep, NativeChatTurnPlan } from './native-chat-turn-plan'
import { useNativeChatToggleScrollCompensation } from './use-native-chat-toggle-scroll-compensation'

const QUIET_ROW_CLASS =
  'flex w-full items-center gap-1.5 py-1 text-left text-xs text-muted-foreground tabular-nums transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** One pip per step, so the shape of the whole plan reads without expanding. */
function PlanPips({ steps }: { steps: readonly NativeChatPlanStep[] }): React.JSX.Element {
  return (
    <span className="inline-flex shrink-0 items-center gap-[3px]" aria-hidden>
      {steps.map((step, index) => (
        <span
          key={index}
          className={cn(
            'h-[3px] w-3 rounded-full',
            step.status === 'completed' && 'bg-muted-foreground/70',
            step.status === 'in_progress' && 'bg-foreground',
            step.status === 'pending' && 'bg-muted-foreground/25'
          )}
        />
      ))}
    </span>
  )
}

function StepIcon({ status }: { status: NativeChatPlanStep['status'] }): React.JSX.Element {
  if (status === 'completed') {
    return <Check className="size-3.5 shrink-0 text-muted-foreground" />
  }
  if (status === 'in_progress') {
    return <Loader className="size-3.5 shrink-0 animate-spin text-foreground" />
  }
  return <Circle className="size-3.5 shrink-0 text-muted-foreground/40" />
}

/**
 * The agent's own checklist for one turn, from its TodoWrite calls.
 *
 * Collapsed it is pips plus the active step and an `n/total` count; expanded it
 * is the full list. It deliberately outlives the turn fold — for a settled turn
 * this is the only remaining record of what the agent set out to do.
 */
export function NativeChatTurnPlanRow({
  plan,
  expanded,
  onToggle
}: {
  plan: NativeChatTurnPlan
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  const { elementRef, captureBeforeToggle } = useNativeChatToggleScrollCompensation(expanded)
  const Chevron = expanded ? ChevronDown : ChevronRight
  const total = plan.steps.length
  const active = plan.activeIndex === null ? null : plan.steps[plan.activeIndex]
  const summary =
    active !== undefined && active !== null
      ? (active.activeForm ?? active.content)
      : translate('components.native-chat.turnPlan.done', 'Plan complete')

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
        <PlanPips steps={plan.steps} />
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <span className="shrink-0 text-muted-foreground/70">
          {plan.completedCount}/{total}
        </span>
      </button>
      {expanded ? (
        <ul className="mb-1 ml-5 space-y-1 border-l border-border/40 pl-3">
          {plan.steps.map((step, index) => (
            <li key={index} className="flex items-start gap-2 text-xs">
              <span className="mt-[1px]">
                <StepIcon status={step.status} />
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1',
                  step.status === 'completed' && 'text-muted-foreground line-through',
                  step.status === 'in_progress' && 'text-foreground',
                  step.status === 'pending' && 'text-muted-foreground'
                )}
              >
                {step.content}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
