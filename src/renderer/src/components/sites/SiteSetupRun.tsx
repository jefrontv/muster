// Screen 3 (Running) and Screen 5 (Failed) from the redesign plan. Both are the same step list,
// just with different footer affordances — a run either keeps going or has stopped on one step,
// there is no third layout to design.

import type React from 'react'
import { Check, Circle, Loader2, Minus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { SiteSetupRow } from './SiteSetupRow'
import { SiteCloneLog } from './SiteCloneLog'
import type { SetupRunPhase, SetupRunStep, SetupRunStepId } from './site-setup-choices'
import { SETUP_RUN_STEP_ORDER } from './site-setup-choices'
import { getSiteSetupRunStrings } from './site-setup-run-strings'

export type SiteSetupRunProps = {
  steps: SetupRunStep[]
  phase: SetupRunPhase
  siteLabel: string
  onCancelCurrent: () => void
  onRetry: () => void
  onFinishLater: () => void
}

// register has no row of its own — it is the instantaneous consent write. It only earns a row
// (titled 'Register site') when it is the one that failed; folded into Clone's detail otherwise.
const VISIBLE_STEP_IDS = SETUP_RUN_STEP_ORDER.filter((id) => id !== 'register')

const STEP_ICONS: Record<SetupRunStep['state'], React.ReactNode> = {
  done: <Check className="size-4 text-green-600 dark:text-green-500" />,
  running: <Loader2 className="size-4 animate-spin" />,
  failed: <X className="size-4 text-destructive" />,
  skipped: <Minus className="size-4 text-muted-foreground" />,
  'not-run': <Minus className="size-4 text-muted-foreground" />,
  pending: <Circle className="size-4 text-muted-foreground" />
}

export function SiteSetupRun({
  steps,
  phase,
  siteLabel,
  onCancelCurrent,
  onRetry,
  onFinishLater
}: SiteSetupRunProps): React.JSX.Element {
  const strings = getSiteSetupRunStrings()
  const stepById: Partial<Record<SetupRunStepId, SetupRunStep>> = {}
  for (const step of steps) {
    stepById[step.id] = step
  }
  const registerStep = stepById.register

  const stepTitles: Record<(typeof VISIBLE_STEP_IDS)[number], string> = {
    clone: strings.stepClone,
    serve: strings.stepServe,
    https: strings.stepHttps,
    import: strings.stepImport
  }
  const runningLabels: Record<(typeof VISIBLE_STEP_IDS)[number], string> = {
    clone: strings.runningClone,
    serve: strings.runningServe,
    https: strings.runningHttps,
    import: strings.runningImport
  }

  const considered = VISIBLE_STEP_IDS.map((id) => stepById[id]).filter(
    (step): step is SetupRunStep => step !== undefined
  )
  const settledStates: readonly SetupRunStep['state'][] = ['done', 'skipped', 'failed']
  const settledCount = considered.filter((step) => settledStates.includes(step.state)).length

  return (
    <div className="space-y-3" aria-label={siteLabel}>
      <div className="divide-y divide-border">
        {registerStep && registerStep.state === 'failed' ? (
          <SiteSetupRow
            icon={STEP_ICONS[registerStep.state]}
            title={strings.stepRegister}
            summary={registerStep.detail}
          />
        ) : null}
        {VISIBLE_STEP_IDS.map((id) => {
          const step = stepById[id]
          if (!step) {
            return null
          }
          const registerDetail =
            id === 'clone' && registerStep?.state === 'failed' ? registerStep.detail : null
          const summary =
            step.state === 'running' && step.detail.length === 0
              ? runningLabels[id]
              : (registerDetail ?? step.detail)
          const showCancel = step.state === 'running' && step.cancellable
          const showCannotCancel = step.state === 'running' && !step.cancellable
          return (
            <SiteSetupRow
              key={id}
              icon={STEP_ICONS[step.state]}
              title={stepTitles[id]}
              summary={summary}
              control={
                showCancel ? (
                  <Button variant="ghost" size="xs" onClick={onCancelCurrent}>
                    {strings.cancel}
                  </Button>
                ) : showCannotCancel ? (
                  <span className="text-xs text-muted-foreground">{strings.cannotCancel}</span>
                ) : undefined
              }
            >
              {step.percent !== null ? (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{ width: `${Math.min(100, Math.max(0, step.percent))}%` }}
                  />
                </div>
              ) : null}
              {step.log.length > 0 ? (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-auto px-0 text-xs text-muted-foreground"
                    >
                      {strings.logLabel}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SiteCloneLog lines={step.log} />
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </SiteSetupRow>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <Progress value={(settledCount / considered.length) * 100} className="flex-1" />
        <span className="shrink-0 text-xs text-muted-foreground">
          {strings.progressLabel
            .replace('{{done}}', String(settledCount))
            .replace('{{total}}', String(considered.length))}
        </span>
      </div>

      {phase === 'running' ? (
        <p className="text-xs text-muted-foreground">{strings.minimizeHint}</p>
      ) : null}

      {phase === 'failed' ? (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFinishLater}>
            {strings.finishLater}
          </Button>
          <Button variant="default" onClick={onRetry}>
            {strings.changeAndRetry}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default SiteSetupRun
