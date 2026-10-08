// Bitbucket Pipelines status for the commits in the Commits panel.
//
// One pipelines list call per refresh (plus one steps call while something runs), matched to
// commits by full hash here in main. Commit build statuses are no use: see site-pipelines.ts.

import type {
  CommitPipelineRun,
  CommitPipelineStatus,
  CommitPipelinesResult
} from '../../shared/commit-pipelines'
import type { SitePipelineRun } from '../../shared/site-types'
import { bitbucketHasAuth } from './bitbucket-http'
import type { BitbucketRepoRef } from './repository-ref'
import {
  listBitbucketPipelineRuns,
  toPermanentPipelinesMiss,
  type BitbucketPipelineRunsDeps
} from './site-pipelines'

/** About a day of pushes on a busy repo; older commits rarely matter and cost nothing to skip. */
export const COMMIT_PIPELINES_PAGE_SIZE = 30

export type BitbucketCommitPipelinesDeps = BitbucketPipelineRunsDeps & {
  hasAuth?: () => boolean
}

const COMMIT_STATUS: Record<SitePipelineRun['status'], CommitPipelineStatus | null> = {
  running: 'running',
  pending: 'pending',
  paused: 'paused',
  success: 'success',
  failure: 'failure',
  stopped: 'stopped',
  // Why: an icon for a state we cannot name would only invite a click to find out.
  unknown: null
}

function toCommitPipelineRun(run: SitePipelineRun): CommitPipelineRun | null {
  const status = COMMIT_STATUS[run.status]
  if (!status) {
    return null
  }
  return {
    status,
    runNumber: run.buildNumber,
    durationSeconds: run.durationSeconds,
    currentStep: run.currentStep,
    startedAt: run.createdOn,
    url: run.url
  }
}

/** Latest run per requested commit. `runs` must be newest first, as the API returns them. */
export function matchPipelineRunsToCommits(
  runs: readonly SitePipelineRun[],
  shas: readonly string[]
): Record<string, CommitPipelineRun> {
  const wanted = new Map(shas.map((sha) => [sha.toLowerCase(), sha]))
  const runsBySha: Record<string, CommitPipelineRun> = {}
  for (const run of runs) {
    const sha = run.commitSha ? wanted.get(run.commitSha.toLowerCase()) : undefined
    if (!sha || runsBySha[sha]) {
      continue
    }
    const mapped = toCommitPipelineRun(run)
    if (mapped) {
      runsBySha[sha] = mapped
    }
  }
  return runsBySha
}

const inFlightByRepo = new Map<string, Promise<SitePipelineRun[]>>()

/** @internal - exposed for tests only */
export function _resetBitbucketCommitPipelinesInFlight(): void {
  inFlightByRepo.clear()
}

// Why: the run list does not depend on which commits are asked about, so two worktrees of one repo
// (or a poll racing a manual refresh) share a single API call.
function listRunsOnce(
  repo: BitbucketRepoRef,
  deps: BitbucketPipelineRunsDeps
): Promise<SitePipelineRun[]> {
  const key = `${repo.workspace}/${repo.repoSlug}`.toLowerCase()
  const existing = inFlightByRepo.get(key)
  if (existing) {
    return existing
  }
  const request = listBitbucketPipelineRuns(repo, COMMIT_PIPELINES_PAGE_SIZE, deps).finally(() => {
    inFlightByRepo.delete(key)
  })
  inFlightByRepo.set(key, request)
  return request
}

export async function getBitbucketCommitPipelines(
  repo: BitbucketRepoRef,
  shas: readonly string[],
  deps: BitbucketCommitPipelinesDeps = {}
): Promise<CommitPipelinesResult> {
  const hasAuth = deps.hasAuth ?? bitbucketHasAuth
  if (!hasAuth()) {
    return { available: false, reason: 'not-authenticated' }
  }
  try {
    const runs = await listRunsOnce(repo, deps)
    return { available: true, runsBySha: matchPipelineRunsToCommits(runs, shas) }
  } catch (error) {
    return { available: false, reason: toPermanentPipelinesMiss(error) }
  }
}
