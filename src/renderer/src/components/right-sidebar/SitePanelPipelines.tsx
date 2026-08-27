// Recent Bitbucket Pipelines runs for the site, shown in the Sites panel.
//
// Renders nothing unless there is something worth saying. A site on a GitHub remote, a signed-out
// user, a consumer without the pipeline scope, and a repo that has never run a pipeline are all
// ordinary states, and a permanent grey row for each would be noise in a panel kept open all day.

import { ExternalLink } from 'lucide-react'
import { openHttpLink } from '@/lib/http-link-routing'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { SitePipelineRun, SitePipelinesResult } from '../../../../shared/site-types'
import {
  RunStatusDot,
  SectionCard,
  SectionHeading,
  formatRelativeTime
} from './site-panel-controls'

// Pipeline states map onto the local run vocabulary so a pipeline row reads the same as a deploy
// row directly beneath it: pulsing = in flight, green = done, red = broken.
const DOT_STATUS: Record<SitePipelineRun['status'], string> = {
  running: 'running',
  pending: 'running',
  paused: 'blocked',
  success: 'succeeded',
  failure: 'failed',
  stopped: 'cancelled',
  unknown: 'cancelled'
}

const TONE: Record<SitePipelineRun['status'], string> = {
  running: 'text-primary',
  pending: 'text-primary',
  paused: 'text-amber-500/90',
  success: 'text-emerald-500/90',
  failure: 'text-destructive',
  stopped: 'text-muted-foreground',
  unknown: 'text-muted-foreground'
}

function statusLabel(status: SitePipelineRun['status']): string {
  switch (status) {
    case 'running':
      return translate('auto.components.right.sidebar.SitePanel.pipelineRunning', 'running')
    case 'pending':
      return translate('auto.components.right.sidebar.SitePanel.pipelineQueued', 'queued')
    case 'paused':
      return translate('auto.components.right.sidebar.SitePanel.pipelinePaused', 'paused')
    case 'success':
      return translate('auto.components.right.sidebar.SitePanel.pipelinePassed', 'passed')
    case 'failure':
      return translate('auto.components.right.sidebar.SitePanel.pipelineFailed', 'failed')
    case 'stopped':
      return translate('auto.components.right.sidebar.SitePanel.pipelineStopped', 'stopped')
    default:
      return translate('auto.components.right.sidebar.SitePanel.pipelineUnknown', 'unknown')
  }
}

export function SitePanelPipelines({
  result
}: {
  result: SitePipelinesResult | null
}): React.JSX.Element | null {
  if (!result?.available || result.runs.length === 0) {
    return null
  }
  const openLabel = translate(
    'auto.components.right.sidebar.SitePanel.pipelineOpen',
    'Open pipeline in Bitbucket'
  )

  return (
    <SectionCard>
      <SectionHeading>
        {translate('auto.components.right.sidebar.SitePanel.pipelines', 'Pipelines')}
      </SectionHeading>
      <ul className="space-y-1">
        {result.runs.map((run) => (
          <li key={run.buildNumber} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <RunStatusDot status={DOT_STATUS[run.status]} />
              {/* Build number over commit sha: it is what the Bitbucket UI and the team's
                  conversations use to name a run. */}
              <span className="shrink-0 text-muted-foreground">#{run.buildNumber}</span>
              <span className="truncate">{run.refName ?? '—'}</span>
              <span className={cn('shrink-0', TONE[run.status])}>{statusLabel(run.status)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {run.createdOn === null ? null : (
                <span className="text-[11px] text-muted-foreground">
                  {formatRelativeTime(run.createdOn)}
                </span>
              )}
              <button
                type="button"
                className="rounded p-1 text-muted-foreground opacity-80 hover:bg-accent hover:text-foreground"
                aria-label={`${openLabel} #${run.buildNumber}`}
                onClick={() => void openHttpLink(run.url)}
              >
                <ExternalLink className="size-3.5" />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
