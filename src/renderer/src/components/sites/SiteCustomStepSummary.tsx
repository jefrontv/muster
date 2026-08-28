// The identity of one custom step: what it is called, when it runs, and what it actually executes.
//
// Shared by the site's own list and the library list so the two cannot drift. The second line is
// always populated — a script step has an empty `command`, and rendering that produced a blank line
// that left every row looking top-heavy and misaligned.

import { customStepSource, type SiteCustomStep } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'

export function SiteCustomStepSummary({ step }: { step: SiteCustomStep }): React.JSX.Element {
  const source = customStepSource(step)
  return (
    <div className="min-w-0 flex-1 space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="truncate text-xs font-medium leading-4">{step.name}</span>
        <span className="shrink-0 text-[9px] uppercase leading-4 tracking-wider text-muted-foreground/70">
          {step.group} · {step.position === 'before' ? 'pre' : 'post'} ·{' '}
          {step.runsOn === 'local' ? 'local' : 'server'}
        </span>
      </div>
      {/* Always shown: a step's name is user-authored, so it is not evidence of what will run. */}
      <p className="truncate font-mono text-[10px] leading-4 text-muted-foreground">
        {source === null
          ? translate('auto.components.sites.StepEditor.nothingToRun', 'Nothing to run')
          : source.kind === 'script'
            ? source.scriptPath
            : source.command}
      </p>
    </div>
  )
}
