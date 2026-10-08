import { translate } from '@/i18n/i18n'
import {
  isCommitPipelineInFlight,
  type CommitPipelineRun,
  type CommitPipelineStatus
} from '../../../../shared/commit-pipelines'

function statusWord(status: CommitPipelineStatus): string {
  switch (status) {
    case 'running':
      return translate('auto.components.right.sidebar.GitHistoryPipelineStatus.running', 'running')
    case 'pending':
      return translate('auto.components.right.sidebar.GitHistoryPipelineStatus.queued', 'queued')
    case 'paused':
      return translate('auto.components.right.sidebar.GitHistoryPipelineStatus.paused', 'paused')
    case 'success':
      return translate('auto.components.right.sidebar.GitHistoryPipelineStatus.passed', 'passed')
    case 'failure':
      return translate('auto.components.right.sidebar.GitHistoryPipelineStatus.failed', 'failed')
    case 'stopped':
      return translate('auto.components.right.sidebar.GitHistoryPipelineStatus.stopped', 'stopped')
    case 'skipped':
      return translate('auto.components.right.sidebar.GitHistoryPipelineStatus.skipped', 'skipped')
  }
}

/** "3m 12s", "45s", "1h 4m". */
export function formatPipelineDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`
}

/** "Pipeline #412 failed · 3m 12s"; a running run names its step instead of a stale duration. */
export function describeCommitPipeline(run: CommitPipelineRun): string {
  const status = statusWord(run.status)
  const head =
    run.runNumber === null
      ? translate(
          'auto.components.right.sidebar.GitHistoryPipelineStatus.checksSummary',
          'Checks {{status}}',
          { status }
        )
      : translate(
          'auto.components.right.sidebar.GitHistoryPipelineStatus.pipelineSummary',
          'Pipeline #{{number}} {{status}}',
          {
            number: run.runNumber,
            status
          }
        )
  const detail = isCommitPipelineInFlight(run.status)
    ? run.currentStep
    : run.durationSeconds === null
      ? null
      : formatPipelineDuration(run.durationSeconds)
  return detail ? `${head} · ${detail}` : head
}

export function commitPipelineOpenLabel(run: CommitPipelineRun): string {
  return translate(
    'auto.components.right.sidebar.GitHistoryPipelineStatus.openInBrowser',
    '{{summary}}. Open in browser',
    {
      summary: describeCommitPipeline(run)
    }
  )
}
