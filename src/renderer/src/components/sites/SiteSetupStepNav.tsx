// The paging chrome for the guided setup: which page you are on, and the way forward.
//
// Why paged at all: the three stages used to stack on one scrolling surface with a single Done in
// the dialog footer, so Done was reachable from the moment the dialog opened — including while the
// plan was still loading and no stage had rendered. One page per decision makes Done exist only
// where it means "finished", and makes "you have not picked a stack yet" a thing that can block.

import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { getSiteSetupStrings } from './site-setup-strings'

export type SetupStepId = 'stack' | 'https' | 'import'

export const SETUP_STEP_ORDER: SetupStepId[] = ['stack', 'https', 'import']

export function useSetupStepLabels(): Record<SetupStepId, string> {
  const strings = getSiteSetupStrings()
  return { stack: strings.stepStack, https: strings.stepHttps, import: strings.stepImport }
}

/** The breadcrumb rail. Past pages are marked done; nothing here navigates — the buttons do that. */
export function SiteSetupStepRail({ current }: { current: SetupStepId }): React.JSX.Element {
  const strings = getSiteSetupStrings()
  const labels = useSetupStepLabels()
  const index = SETUP_STEP_ORDER.indexOf(current)
  return (
    <ol
      aria-label={strings.stepListLabel}
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      {SETUP_STEP_ORDER.map((step, position) => {
        const done = position < index
        const active = position === index
        return (
          <li key={step} className="flex items-center gap-1.5">
            {position > 0 ? <span className="text-muted-foreground/40">/</span> : null}
            <span
              aria-current={active ? 'step' : undefined}
              className={active ? 'font-medium text-foreground' : ''}
            >
              {done ? <Check className="mr-1 inline size-3" /> : null}
              {labels[step]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function SiteSetupStepNav({
  current,
  canAdvance,
  blockedReason,
  busy = false,
  onBack,
  onNext,
  onDone,
  onSkip,
  onRun
}: {
  current: SetupStepId
  /** False keeps the user on this page; `blockedReason` is what tells them why. */
  canAdvance: boolean
  blockedReason: string
  /**
   * A stage is mid-run. Everything locks, Done included: the migration is moving files and the
   * import is a live SSH run, and closing the dialog is how you lose the only view of either.
   */
  busy?: boolean
  onBack: () => void
  onNext: () => void
  onDone: () => void
  /** Present only where the page can be skipped — jumps to the last page (or finishes). */
  onSkip?: () => void
  /** Present on the import step while there is something to run: Run replaces Done in the footer. */
  onRun?: () => void
}): React.JSX.Element {
  const strings = getSiteSetupStrings()
  const index = SETUP_STEP_ORDER.indexOf(current)
  const last = index === SETUP_STEP_ORDER.length - 1
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
      <p className="min-w-0 text-xs text-muted-foreground">
        {busy
          ? strings.stepBusy
          : !canAdvance && blockedReason.length > 0
            ? blockedReason
            : strings.stepCounter
                .replace('{{current}}', String(index + 1))
                .replace('{{total}}', String(SETUP_STEP_ORDER.length))}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {index > 0 ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            {strings.back}
          </Button>
        ) : null}
        {onSkip ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onSkip}>
            {strings.skip}
          </Button>
        ) : null}
        {last ? (
          onRun ? (
            <Button size="sm" disabled={busy} onClick={onRun}>
              {strings.run}
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={onDone}>
              {strings.done}
            </Button>
          )
        ) : (
          <Button size="sm" disabled={busy || !canAdvance} onClick={onNext}>
            {strings.next}
            <ArrowRight className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
