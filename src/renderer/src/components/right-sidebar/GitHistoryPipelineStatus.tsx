import React from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { openHttpLink } from '@/lib/http-link-routing'
import { cn } from '@/lib/utils'
import {
  isCommitPipelineInFlight,
  type CommitPipelineRun
} from '../../../../shared/commit-pipelines'
import { commitPipelineOpenLabel, describeCommitPipeline } from './commit-pipeline-labels'

function PipelineGlyph({ run }: { run: CommitPipelineRun }): React.JSX.Element {
  if (isCommitPipelineInFlight(run.status)) {
    return <Loader2 aria-hidden="true" className="size-3 animate-spin text-muted-foreground" />
  }
  if (run.status === 'success') {
    return <Check aria-hidden="true" className="size-3 text-status-success" />
  }
  if (run.status === 'failure') {
    return <X aria-hidden="true" className="size-3 text-destructive" />
  }
  return <span aria-hidden="true" className="size-1.5 rounded-full bg-muted-foreground/60" />
}

/** Fixed-width cell so rows with and without a run keep their badges aligned. */
export function GitHistoryPipelineStatus({
  run
}: {
  run: CommitPipelineRun | undefined
}): React.JSX.Element {
  const cellClassName = 'flex size-4 shrink-0 items-center justify-center'
  if (!run) {
    return <span aria-hidden="true" className={cellClassName} />
  }
  const summary = describeCommitPipeline(run)
  const glyph = <PipelineGlyph run={run} />
  if (!run.url) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span role="img" aria-label={summary} className={cellClassName}>
            {glyph}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {summary}
        </TooltipContent>
      </Tooltip>
    )
  }
  const url = run.url
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={commitPipelineOpenLabel(run)}
          className={cn(
            cellClassName,
            'rounded-sm outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring'
          )}
          onClick={() => void openHttpLink(url)}
        >
          {glyph}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {summary}
      </TooltipContent>
    </Tooltip>
  )
}
