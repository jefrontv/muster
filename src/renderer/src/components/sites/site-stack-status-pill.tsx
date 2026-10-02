// The header pill on the Local card: one word for what the stack reports, or the transition the
// user just started until the stack confirms it.

import { Loader2 } from 'lucide-react'
import type React from 'react'
import type { LocalWpStackDetection } from '../../../../shared/site-stack-types'
import type { SiteLocalStack } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

export type SiteStackPill =
  | 'running'
  | 'stopped'
  | 'starting'
  | 'stopping'
  | 'not-set-up'
  | 'unavailable'
  | null

/** What the header pill says. Exported for tests: the states are the contract. */
export function siteStackPill(args: {
  stack: SiteLocalStack
  detection: LocalWpStackDetection | null
  transition: 'starting' | 'stopping' | null
}): SiteStackPill {
  const { stack, detection, transition } = args
  if (transition) {
    return transition
  }
  if (stack === 'plain' || !detection) {
    return null
  }
  if (detection.stack !== stack) {
    return 'not-set-up'
  }
  // A DDEV answer with Docker down cannot say running or stopped.
  if (stack === 'ddev' && !detection.appRunning) {
    return 'unavailable'
  }
  return detection.socketReady ? 'running' : 'stopped'
}

function pillLabel(pill: Exclude<SiteStackPill, null>): string {
  switch (pill) {
    case 'running':
      return translate('auto.components.sites.SiteLocalStackCard.pillRunning', 'Running')
    case 'stopped':
      return translate('auto.components.sites.SiteLocalStackCard.pillStopped', 'Stopped')
    case 'starting':
      return translate('auto.components.sites.SiteLocalStackCard.pillStarting', 'Starting…')
    case 'stopping':
      return translate('auto.components.sites.SiteLocalStackCard.pillStopping', 'Stopping…')
    case 'not-set-up':
      return translate('auto.components.sites.SiteLocalStackCard.pillNotSetUp', 'Not set up')
    case 'unavailable':
      return translate('auto.components.sites.SiteLocalStackCard.pillUnavailable', 'Unavailable')
  }
}

export function SiteStackStatusPill({ pill }: { pill: SiteStackPill }): React.JSX.Element | null {
  if (!pill) {
    return null
  }
  const busy = pill === 'starting' || pill === 'stopping'
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground" role="status">
      {busy ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'inline-block size-1.5 shrink-0 rounded-full',
            pill === 'running' && 'bg-status-success',
            pill === 'stopped' && 'bg-muted-foreground/60',
            pill === 'not-set-up' && 'bg-status-attention',
            pill === 'unavailable' && 'bg-destructive'
          )}
        />
      )}
      {pillLabel(pill)}
    </span>
  )
}
