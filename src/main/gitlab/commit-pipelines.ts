// GitLab pipeline status for the commits in the Commits panel.
//
// `/projects/:id/pipelines` carries each run's `sha`, so like Bitbucket this is one list call per
// refresh, matched to the listed commits by full hash here in main.

import {
  latestRunPerCommit,
  type CommitPipelineRun,
  type CommitPipelineStatus,
  type CommitPipelinesResult
} from '../../shared/commit-pipelines'
import { extractExecError } from '../git/exec-error'
import {
  acquire,
  glabExecFileAsync,
  glabHostnameArgs,
  glabRepoExecOptions,
  release,
  type LocalGitExecOptions,
  type ProjectRef
} from './gl-utils'

/** Matches the Bitbucket page size: about a day of pushes on a busy project. */
const PAGE_SIZE = 30

type RawGitLabPipeline = {
  id?: number | null
  sha?: string | null
  status?: string | null
  created_at?: string | null
  web_url?: string | null
}

export type GitLabCommitPipelinesContext = {
  repoPath: string
  connectionId?: string | null
  localGitOptions?: LocalGitExecOptions
}

export type GitLabCommitPipelinesDeps = {
  runApi?: (context: GitLabCommitPipelinesContext, args: string[]) => Promise<string>
}

const GITLAB_STATUS: Record<string, CommitPipelineStatus> = {
  created: 'pending',
  waiting_for_resource: 'pending',
  preparing: 'pending',
  pending: 'pending',
  scheduled: 'pending',
  running: 'running',
  success: 'success',
  failed: 'failure',
  canceled: 'stopped',
  canceling: 'stopped',
  skipped: 'skipped',
  // Why: waiting on someone to press play, so drawn idle and never polled.
  manual: 'paused'
}

export function mapGitLabPipelineStatus(
  status: string | null | undefined
): CommitPipelineStatus | null {
  return GITLAB_STATUS[status?.trim().toLowerCase() ?? ''] ?? null
}

function toCommitPipelineRun(raw: RawGitLabPipeline): CommitPipelineRun | null {
  const status = mapGitLabPipelineStatus(raw.status)
  if (!status) {
    return null
  }
  const createdAt = raw.created_at ? Date.parse(raw.created_at) : Number.NaN
  return {
    status,
    runNumber: typeof raw.id === 'number' ? raw.id : null,
    // Why: the list payload has no duration, and fetching each pipeline would cost a call per row.
    durationSeconds: null,
    currentStep: null,
    startedAt: Number.isNaN(createdAt) ? null : createdAt,
    url: raw.web_url?.trim() || null
  }
}

export function matchGitLabPipelinesToCommits(
  pipelines: readonly RawGitLabPipeline[],
  shas: readonly string[]
): Record<string, CommitPipelineRun> {
  return latestRunPerCommit(
    pipelines.map((raw) => ({ sha: raw.sha?.trim() || null, run: toCommitPipelineRun(raw) })),
    shas
  )
}

/** Signed out, no access and gone are answered; anything else is transient and rethrown. */
function toPermanentPipelinesMiss(error: unknown): 'not-authenticated' | 'forbidden' | 'not-found' {
  const code = (error as { code?: unknown } | null)?.code
  const stderr = extractExecError(error).stderr.toLowerCase()
  if (stderr.includes('rate limit') || stderr.includes('http 429')) {
    throw error
  }
  if (code === 'ENOENT' || stderr.includes('glab auth login') || stderr.includes('http 401')) {
    return 'not-authenticated'
  }
  if (stderr.includes('http 403') || stderr.includes('insufficient_scope')) {
    return 'forbidden'
  }
  if (stderr.includes('http 404') || stderr.includes('project not found')) {
    return 'not-found'
  }
  throw error
}

async function defaultRunApi(
  context: GitLabCommitPipelinesContext,
  args: string[]
): Promise<string> {
  await acquire()
  try {
    const { stdout } = await glabExecFileAsync(
      args,
      glabRepoExecOptions(context.repoPath, context.connectionId, context.localGitOptions)
    )
    return stdout
  } finally {
    release()
  }
}

const inFlight = new Map<string, Promise<readonly RawGitLabPipeline[]>>()

/** @internal - exposed for tests only */
export function _resetGitLabCommitPipelinesInFlight(): void {
  inFlight.clear()
}

// Why: the list does not depend on which commits are asked about, so concurrent callers share it.
function listPipelinesOnce(
  context: GitLabCommitPipelinesContext,
  project: ProjectRef,
  runApi: NonNullable<GitLabCommitPipelinesDeps['runApi']>
): Promise<readonly RawGitLabPipeline[]> {
  const key = `${project.host}/${project.path}`.toLowerCase()
  const existing = inFlight.get(key)
  if (existing) {
    return existing
  }
  const args = [
    'api',
    ...glabHostnameArgs(project, context.connectionId),
    `projects/${encodeURIComponent(project.path)}/pipelines?per_page=${PAGE_SIZE}&order_by=id&sort=desc`
  ]
  const request = runApi(context, args)
    .then((stdout) => {
      const parsed = JSON.parse(stdout) as unknown
      return Array.isArray(parsed) ? (parsed as RawGitLabPipeline[]) : []
    })
    .finally(() => {
      inFlight.delete(key)
    })
  inFlight.set(key, request)
  return request
}

export async function getGitLabCommitPipelines(
  context: GitLabCommitPipelinesContext,
  project: ProjectRef,
  shas: readonly string[],
  deps: GitLabCommitPipelinesDeps = {}
): Promise<CommitPipelinesResult> {
  try {
    const pipelines = await listPipelinesOnce(context, project, deps.runApi ?? defaultRunApi)
    return { available: true, runsBySha: matchGitLabPipelinesToCommits(pipelines, shas) }
  } catch (error) {
    return { available: false, reason: toPermanentPipelinesMiss(error) }
  }
}
