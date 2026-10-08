// When the Commits panel spends a forge API call on CI status.
//
// Bitbucket caps an account at roughly 1000 requests an hour across everything Muster does, so
// the panel polls only while it can show something changing: a run in flight, or a push whose
// pipeline has not appeared yet. Everything else waits for the next history load.

import type { GitUpstreamStatus } from '../../../../shared/git-status-types'
import {
  isCommitPipelineInFlight,
  type CommitPipelineRun
} from '../../../../shared/commit-pipelines'

export const COMMIT_PIPELINES_POLL_MS = 60_000
/** A same-commits history reload (manual refresh, focus) refetches at most this often. */
export const COMMIT_PIPELINES_MIN_REFETCH_MS = 15_000
/** Long enough for Bitbucket to create the run a push triggers and for it to start. */
export const COMMIT_PIPELINES_PUSH_GRACE_MS = 3 * 60_000
export const COMMIT_PIPELINES_AFTER_PUSH_DELAY_MS = 5_000
/** A run "in progress" for longer than this is stuck, not worth a call a minute. */
export const COMMIT_PIPELINES_STALE_RUN_MS = 3 * 60 * 60_000

export function hasActiveCommitPipeline(
  runsBySha: Readonly<Record<string, CommitPipelineRun>>,
  now: number
): boolean {
  return Object.values(runsBySha).some(
    (run) =>
      isCommitPipelineInFlight(run.status) &&
      (run.startedAt === null || now - run.startedAt < COMMIT_PIPELINES_STALE_RUN_MS)
  )
}

export function shouldPollCommitPipelines(args: {
  runsBySha: Readonly<Record<string, CommitPipelineRun>> | null
  now: number
  pushGraceUntil: number
}): boolean {
  if (!args.runsBySha) {
    return false
  }
  return args.now < args.pushGraceUntil || hasActiveCommitPipeline(args.runsBySha, args.now)
}

export type CommitPushState = Pick<GitUpstreamStatus, 'hasUpstream' | 'upstreamName' | 'ahead'>

/** Publishing a branch, or the ahead count draining to zero on the same upstream. */
export function isPushTransition(
  previous: CommitPushState | null | undefined,
  next: CommitPushState | null | undefined
): boolean {
  if (!previous || !next?.hasUpstream) {
    return false
  }
  if (!previous.hasUpstream) {
    return true
  }
  return previous.upstreamName === next.upstreamName && previous.ahead > 0 && next.ahead === 0
}
