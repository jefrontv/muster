// GitHub check status for the commits in the Commits panel.
//
// One GraphQL call per refresh: every listed commit is an aliased `object(oid:)` lookup in the same
// query, so 50 commits cost one request and one point against the user's `gh` budget.

import type {
  CommitPipelineRun,
  CommitPipelineStatus,
  CommitPipelinesResult
} from '../../shared/commit-pipelines'
import { githubRepoIdentityKey } from '../../shared/github-repository-identity-key'
import { extractExecError } from '../git/exec-error'
import { acquire, ghExecFileAsync, release } from './gh-utils'
import {
  githubRepositoryWebHost,
  resolveGitHubRepoExecution,
  type GitHubApiRepository,
  type GitHubRepoExecOptions
} from './github-api-repository'
import { noteRepositoryRateLimitSpend, repositoryRateLimitGuard } from './rate-limit'
import type { LocalGitExecOptions } from './gh-utils'

type RawCommitNode = {
  committedDate?: string | null
  statusCheckRollup?: { state?: string | null } | null
} | null

type RawRollupResponse = {
  data?: { repository?: Record<string, RawCommitNode> | null } | null
}

export type GitHubCommitChecksContext = {
  repoPath: string
  connectionId?: string | null
  localGitOptions?: LocalGitExecOptions
}

export type GitHubCommitChecksDeps = {
  runGraphql?: (args: string[], options: GitHubRepoExecOptions) => Promise<string>
  resolveExecOptions?: (
    context: GitHubCommitChecksContext,
    repo: GitHubApiRepository
  ) => Promise<GitHubRepoExecOptions>
  isRateLimited?: (repo: GitHubApiRepository, options: GitHubRepoExecOptions) => boolean
}

// Why: the rollup cannot tell queued from running; both draw a spinner, so call it running.
const ROLLUP_STATUS: Record<string, CommitPipelineStatus> = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  ERROR: 'failure',
  PENDING: 'running',
  EXPECTED: 'pending'
}

export function mapCheckRollupState(state: string | null | undefined): CommitPipelineStatus | null {
  return ROLLUP_STATUS[state?.trim().toUpperCase() ?? ''] ?? null
}

/** Shas come from normalizeCommitShas (hex only), so inlining them cannot inject GraphQL. */
export function buildCommitRollupQuery(shas: readonly string[]): string {
  const fields = shas
    .map(
      (sha, index) =>
        `c${index}: object(oid: "${sha}") { ... on Commit { committedDate statusCheckRollup { state } } }`
    )
    .join('\n    ')
  return `query($owner: String!, $repo: String!) {\n  repository(owner: $owner, name: $repo) {\n    ${fields}\n  }\n}`
}

function epochMs(value: string | null | undefined): number | null {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(parsed) ? null : parsed
}

export function mapCommitRollups(
  response: RawRollupResponse,
  shas: readonly string[],
  repo: GitHubApiRepository
): Record<string, CommitPipelineRun> {
  const nodes = response.data?.repository ?? {}
  const runsBySha: Record<string, CommitPipelineRun> = {}
  shas.forEach((sha, index) => {
    const node = nodes[`c${index}`]
    const status = mapCheckRollupState(node?.statusCheckRollup?.state)
    if (!node || !status) {
      return
    }
    runsBySha[sha] = {
      status,
      runNumber: null,
      durationSeconds: null,
      currentStep: null,
      // Why: commit time bounds how long a never-reported required check keeps the poll alive.
      startedAt: epochMs(node.committedDate),
      url: `https://${githubRepositoryWebHost(repo)}/${repo.owner}/${repo.repo}/commit/${sha}/checks`
    }
  })
  return runsBySha
}

/** Signed out, no access and gone are answered; anything else is transient and rethrown. */
function toPermanentChecksMiss(error: unknown): 'not-authenticated' | 'forbidden' | 'not-found' {
  const code = (error as { code?: unknown } | null)?.code
  const stderr = extractExecError(error).stderr.toLowerCase()
  if (stderr.includes('rate limit')) {
    throw error
  }
  if (code === 'ENOENT' || stderr.includes('gh auth login') || stderr.includes('http 401')) {
    return 'not-authenticated'
  }
  if (stderr.includes('http 403') || stderr.includes('resource not accessible')) {
    return 'forbidden'
  }
  if (stderr.includes('http 404') || stderr.includes('could not resolve to a repository')) {
    return 'not-found'
  }
  throw error
}

async function defaultResolveExecOptions(
  context: GitHubCommitChecksContext,
  repo: GitHubApiRepository
): Promise<GitHubRepoExecOptions> {
  const { ghOptions } = await resolveGitHubRepoExecution(
    context.repoPath,
    repo,
    context.connectionId,
    context.localGitOptions ?? {}
  )
  return ghOptions
}

async function defaultRunGraphql(args: string[], options: GitHubRepoExecOptions): Promise<string> {
  await acquire()
  try {
    return (await ghExecFileAsync(args, options)).stdout
  } finally {
    release()
  }
}

function defaultIsRateLimited(repo: GitHubApiRepository, options: GitHubRepoExecOptions): boolean {
  return repositoryRateLimitGuard(repo, 'graphql', options).blocked
}

const inFlight = new Map<string, Promise<CommitPipelinesResult>>()

/** @internal - exposed for tests only */
export function _resetGitHubCommitChecksInFlight(): void {
  inFlight.clear()
}

export function getGitHubCommitChecks(
  context: GitHubCommitChecksContext,
  repo: GitHubApiRepository,
  shas: readonly string[],
  deps: GitHubCommitChecksDeps = {}
): Promise<CommitPipelinesResult> {
  const key = `${githubRepoIdentityKey(repo)}\0${shas.join(',')}`
  const existing = inFlight.get(key)
  if (existing) {
    return existing
  }
  const request = fetchCommitChecks(context, repo, shas, deps).finally(() => {
    inFlight.delete(key)
  })
  inFlight.set(key, request)
  return request
}

async function fetchCommitChecks(
  context: GitHubCommitChecksContext,
  repo: GitHubApiRepository,
  shas: readonly string[],
  deps: GitHubCommitChecksDeps
): Promise<CommitPipelinesResult> {
  const resolveExecOptions = deps.resolveExecOptions ?? defaultResolveExecOptions
  const runGraphql = deps.runGraphql ?? defaultRunGraphql
  const isRateLimited = deps.isRateLimited ?? defaultIsRateLimited

  const ghOptions = await resolveExecOptions(context, repo)
  if (isRateLimited(repo, ghOptions)) {
    // Why: thrown, not "unavailable", so the renderer keeps showing what it already has.
    throw new Error('GitHub GraphQL rate limit nearly exhausted')
  }
  const args = [
    'api',
    'graphql',
    '-f',
    `query=${buildCommitRollupQuery(shas)}`,
    '-f',
    `owner=${repo.owner}`,
    '-f',
    `repo=${repo.repo}`
  ]
  try {
    noteRepositoryRateLimitSpend(repo, 'graphql', 1, ghOptions)
    const stdout = await runGraphql(args, ghOptions)
    const response = JSON.parse(stdout) as RawRollupResponse
    return { available: true, runsBySha: mapCommitRollups(response, shas, repo) }
  } catch (error) {
    return { available: false, reason: toPermanentChecksMiss(error) }
  }
}
