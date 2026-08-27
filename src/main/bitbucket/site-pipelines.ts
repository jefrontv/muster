// Recent Bitbucket Pipelines runs for a site checkout, for the Sites side panel.
//
// Why not commit build statuses (`/commit/{sha}/statuses/build`): that endpoint is the
// third-party CI integration surface — external build servers POST into it. Pipelines does not
// write there. Verified against 170 Bitbucket sites: every one returned an empty status list,
// including repos whose HEAD commit demonstrably had a successful pipeline run.
//
// The `pipeline` scope this needs is already held by the shipped OAuth consumer, so no
// re-authorisation is required. A self-built Muster pointed at a consumer without it gets a 403,
// which is reported as `forbidden` rather than thrown.

import type { SitePipelineRun, SitePipelinesResult } from '../../shared/site-types'
import { bitbucketHasAuth, bitbucketRequestJson } from './bitbucket-http'
import { getBitbucketRepoRef, type BitbucketRepoRef } from './repository-ref'

/**
 * The HTTP client throws a plain Error carrying the status only in its message
 * (`Bitbucket request failed: HTTP 403`), so these read it back out rather than inventing a
 * parallel error type for one call site.
 */
function isStatus(error: unknown, status: number): boolean {
  return error instanceof Error && new RegExp(`HTTP ${status}\\b`).test(error.message)
}

/**
 * Permanently nothing to show, as opposed to a transient failure worth retrying.
 *
 * 403: the OAuth consumer has no `pipeline` scope. 404: the workspace/slug the remote points at is
 * gone or was never a Pipelines repo — seen on real sites whose Bitbucket repo was renamed while
 * the local remote kept the old URL.
 */
function isPermanentlyUnavailable(error: unknown): 'forbidden' | 'not-found' | null {
  if (isStatus(error, 403)) {
    return 'forbidden'
  }
  return isStatus(error, 404) ? 'not-found' : null
}

/** Enough rows to see a pattern without turning the panel into a build history page. */
const RUN_LIMIT = 3

type RawPipeline = {
  uuid?: string | null
  build_number?: number | null
  state?: { name?: string | null; result?: { name?: string | null } | null } | null
  target?: {
    ref_name?: string | null
    commit?: { hash?: string | null } | null
  } | null
  trigger?: { name?: string | null } | null
  created_on?: string | null
  completed_on?: string | null
  duration_in_seconds?: number | null
}

type RawPipelineStep = {
  name?: string | null
  state?: { name?: string | null; result?: { name?: string | null } | null } | null
}

export type SitePipelinesDeps = {
  resolveRepoRef?: (repoPath: string) => Promise<BitbucketRepoRef | null>
  hasAuth?: () => boolean
  fetchPipelines?: (repo: BitbucketRepoRef) => Promise<readonly RawPipeline[]>
  fetchSteps?: (repo: BitbucketRepoRef, pipelineUuid: string) => Promise<readonly RawPipelineStep[]>
}

/**
 * The step a pipeline is actually on, plus how far through it is.
 *
 * Only ever computed for an in-flight run: steps cost a second API call per poll, and "which step
 * is it on" is a question nobody asks about a pipeline that finished two days ago.
 */
export function deriveStepProgress(steps: readonly RawPipelineStep[]): {
  currentStep: string | null
  completedSteps: number
  totalSteps: number
} {
  let completed = 0
  let current: string | null = null
  for (const step of steps) {
    const state = step.state?.name?.trim().toUpperCase() ?? ''
    if (state === 'COMPLETED') {
      completed += 1
      continue
    }
    // The first thing not yet finished is what the pipeline is working on. Bitbucket returns steps
    // in execution order, so this does not need a timestamp comparison.
    current ??= step.name?.trim() || null
  }
  return { currentStep: current, completedSteps: completed, totalSteps: steps.length }
}

/**
 * Bitbucket splits "is it finished" (`state.name`) from "how did it end" (`state.result.name`),
 * and only the pair is meaningful: a COMPLETED pipeline is not necessarily a passing one.
 */
export function mapPipelineStatus(raw: RawPipeline): SitePipelineRun['status'] {
  const state = raw.state?.name?.trim().toUpperCase() ?? ''
  if (state === 'IN_PROGRESS') {
    return 'running'
  }
  if (state === 'PENDING') {
    return 'pending'
  }
  if (state === 'PAUSED' || state === 'HALTED') {
    return 'paused'
  }
  if (state !== 'COMPLETED') {
    return 'unknown'
  }
  switch (raw.state?.result?.name?.trim().toUpperCase()) {
    case 'SUCCESSFUL':
      return 'success'
    case 'FAILED':
    case 'ERROR':
      return 'failure'
    case 'STOPPED':
      return 'stopped'
    default:
      return 'unknown'
  }
}

function epochMs(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function toRun(raw: RawPipeline, repo: BitbucketRepoRef): SitePipelineRun | null {
  const buildNumber = typeof raw.build_number === 'number' ? raw.build_number : null
  if (buildNumber === null) {
    return null
  }
  return {
    buildNumber,
    status: mapPipelineStatus(raw),
    refName: raw.target?.ref_name?.trim() || null,
    commitSha: raw.target?.commit?.hash?.trim() || null,
    trigger: raw.trigger?.name?.trim() || null,
    createdOn: epochMs(raw.created_on),
    durationSeconds: typeof raw.duration_in_seconds === 'number' ? raw.duration_in_seconds : null,
    // Filled in afterwards, and only for a run still in flight.
    currentStep: null,
    completedSteps: null,
    totalSteps: null,
    // Built rather than taken from `links.self`, which is an API URL keyed by repository UUID and
    // opens JSON, not the page a person wants.
    url: `https://bitbucket.org/${repo.workspace}/${repo.repoSlug}/pipelines/results/${buildNumber}`
  }
}

async function fetchPipelinesFromApi(repo: BitbucketRepoRef): Promise<readonly RawPipeline[]> {
  const encoded = `${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repoSlug)}`
  const data = await bitbucketRequestJson<{ values?: RawPipeline[] }>(
    `/repositories/${encoded}/pipelines`,
    { searchParams: { pagelen: String(RUN_LIMIT), sort: '-created_on' } },
    true
  )
  return data?.values ?? []
}

async function fetchStepsFromApi(
  repo: BitbucketRepoRef,
  pipelineUuid: string
): Promise<readonly RawPipelineStep[]> {
  const encoded = `${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repoSlug)}`
  const data = await bitbucketRequestJson<{ values?: RawPipelineStep[] }>(
    `/repositories/${encoded}/pipelines/${encodeURIComponent(pipelineUuid)}/steps`,
    { searchParams: { pagelen: '50' } },
    true
  )
  return data?.values ?? []
}

/** Runs still doing work, and so worth spending a second call on to name the current step. */
function isInFlight(status: SitePipelineRun['status']): boolean {
  return status === 'running' || status === 'pending' || status === 'paused'
}

/**
 * Recent pipeline runs for the checkout at `repoPath`.
 *
 * Every "nothing to show" case is a reason rather than an error: a GitHub-hosted site is not a
 * failure, and the panel needs to stay silent instead of showing a permanent grey row.
 */
export async function getSitePipelines(
  repoPath: string,
  deps: SitePipelinesDeps = {}
): Promise<SitePipelinesResult> {
  const resolveRepoRef = deps.resolveRepoRef ?? ((path: string) => getBitbucketRepoRef(path))
  const hasAuth = deps.hasAuth ?? bitbucketHasAuth
  const fetchPipelines = deps.fetchPipelines ?? fetchPipelinesFromApi
  const fetchSteps = deps.fetchSteps ?? fetchStepsFromApi

  const repo = await resolveRepoRef(repoPath)
  if (!repo) {
    return { available: false, reason: 'not-bitbucket' }
  }
  // Checked after the remote so someone with no Bitbucket sites is never nagged to sign in.
  if (!hasAuth()) {
    return { available: false, reason: 'not-authenticated' }
  }

  try {
    const raw = await fetchPipelines(repo)
    const runs: SitePipelineRun[] = []
    const pending: { run: SitePipelineRun; uuid: string }[] = []
    for (const entry of raw) {
      const run = toRun(entry, repo)
      if (!run) {
        continue
      }
      const uuid = entry.uuid?.trim()
      if (isInFlight(run.status) && uuid) {
        pending.push({ run, uuid })
      }
      runs.push(run)
    }
    // The newest run still working, which is not necessarily the newest run: a stuck pipeline can
    // sit IN_PROGRESS for months while later ones start and finish above it. Only one is enriched
    // — steps cost an extra call per poll, and a finished run's step list adds nothing.
    const inFlight = pending[0]
    if (inFlight) {
      // A failure here must not lose the run list — the row is still worth showing without it.
      const steps = await fetchSteps(repo, inFlight.uuid).catch(() => [])
      Object.assign(inFlight.run, deriveStepProgress(steps))
    }
    return { available: true, runs, workspace: repo.workspace, repoSlug: repo.repoSlug }
  } catch (error) {
    // Permanent misses are answered, not thrown: retrying a 403 or 404 every minute produces an
    // error the user cannot act on. Anything else (a 500, a dropped connection) propagates so the
    // caller can keep showing the last good result instead of pretending there are no pipelines.
    const permanent = isPermanentlyUnavailable(error)
    if (permanent) {
      return { available: false, reason: permanent }
    }
    throw error
  }
}
