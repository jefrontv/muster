// The way back to a site setup that was pushed to the status bar.
//
// Always rendered, deliberately not behind a `statusBarItems` toggle: like UpdateStatusSegment,
// this is the only route back to a minimized flow, and a hidden chip would strand a clone or an
// import with no way to reach it.

import React from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '../../store'
import { translate } from '@/i18n/i18n'
import { describeMinimizedFlow, primaryMinimizedFlow } from '../../../../shared/site-setup-minimize'

export function SiteSetupStatusSegment({
  iconOnly
}: {
  compact: boolean
  iconOnly: boolean
}): React.JSX.Element | null {
  const flows = useAppStore((s) => s.minimizedSiteSetupFlows)
  // Restoring IS removing: a flow's presence in this map is what hides its dialog, so dropping the
  // entry brings the dialog straight back with all of its state — nothing is rebuilt.
  const restore = useAppStore((s) => s.clearSiteSetupFlow)

  const entries = Object.values(flows)
  const primary = primaryMinimizedFlow(entries)
  if (!primary) {
    return null
  }

  // Why the icon carries the phase: at a glance the user needs to know whether to leave it running
  // or go and answer it. Amber pulsing is this file's own "needs attention" convention.
  const icon =
    primary.phase === 'error' ? (
      <AlertCircle className="size-3.5 shrink-0 text-yellow-500" />
    ) : primary.phase === 'waiting' ? (
      <span className="animate-attention-pulse size-2 shrink-0 rounded-full bg-amber-500" />
    ) : (
      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
    )

  // A stage name, not a bare spinner: at minute nine of an import, "Importing 40%" is the only
  // thing that distinguishes working from wedged.
  const label =
    primary.percent === null ? primary.stage : `${primary.stage} ${Math.round(primary.percent)}%`

  const extra = entries.length - 1
  const tooltip =
    extra > 0
      ? `${entries.map(describeMinimizedFlow).join(' · ')} — click to reopen`
      : translate('auto.components.status-bar.siteSetupRestore', 'Reopen {{flow}}').replace(
          '{{flow}}',
          describeMinimizedFlow(primary)
        )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => restore(primary.id)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-accent/70"
          aria-label={tooltip}
        >
          {icon}
          {!iconOnly && (
            // Fixed minimum so a changing percentage cannot resize the row mid-clone.
            <span className="min-w-[7ch] text-left text-[11px] tabular-nums">{label}</span>
          )}
          {extra > 0 ? <span className="text-[11px] text-muted-foreground">+{extra}</span> : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
