// Routes a Commits panel CI lookup to whichever forge hosts the repo's origin remote.
//
// The remote URL is read on the host that owns the checkout (SSH included, via the SSH git
// provider); the forge API call itself always runs from this machine with the user's credentials.

import {
  COMMIT_PIPELINES_MAX_SHAS,
  type CommitPipelinesResult
} from '../../shared/commit-pipelines'
import { getBitbucketRepoSlug } from '../bitbucket/client'
import { getBitbucketCommitPipelines } from '../bitbucket/commit-pipelines'
import type { BitbucketRepoRef } from '../bitbucket/repository-ref'
import { getRepoSlug } from '../github/client'
import {
  getGitHubCommitChecks,
  type GitHubCommitChecksContext
} from '../github/commit-check-rollups'
import type { GitHubApiRepository } from '../github/github-api-repository'
import type { ForgeProviderRepositoryContext } from './forge-provider'

export type CommitPipelinesDeps = {
  resolveBitbucketRepo?: (
    context: ForgeProviderRepositoryContext
  ) => Promise<BitbucketRepoRef | null>
  getBitbucketPipelines?: (
    repo: BitbucketRepoRef,
    shas: readonly string[]
  ) => Promise<CommitPipelinesResult>
  resolveGitHubRepo?: (
    context: ForgeProviderRepositoryContext
  ) => Promise<GitHubApiRepository | null>
  getGitHubChecks?: (
    context: GitHubCommitChecksContext,
    repo: GitHubApiRepository,
    shas: readonly string[]
  ) => Promise<CommitPipelinesResult>
}

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}([0-9a-f]{24})?$/i

/** Full SHA-1 or SHA-256 hashes only, deduped and capped, so a bad caller cannot fan out calls. */
export function normalizeCommitShas(shas: unknown): string[] {
  if (!Array.isArray(shas)) {
    return []
  }
  const unique = new Set<string>()
  for (const sha of shas) {
    if (typeof sha === 'string' && COMMIT_SHA_PATTERN.test(sha)) {
      unique.add(sha)
    }
    if (unique.size >= COMMIT_PIPELINES_MAX_SHAS) {
      break
    }
  }
  return [...unique]
}

function resolveBitbucketRepoFromContext(
  context: ForgeProviderRepositoryContext
): Promise<BitbucketRepoRef | null> {
  return getBitbucketRepoSlug(context.repoPath, context.connectionId, context)
}

function resolveGitHubRepoFromContext(
  context: ForgeProviderRepositoryContext
): Promise<GitHubApiRepository | null> {
  return getRepoSlug(context.repoPath, context.connectionId, context)
}

// Why: nothing on screen yet still answers "available" so the column does not flicker away.
function lookupUnlessEmpty(
  shas: readonly string[],
  lookup: () => Promise<CommitPipelinesResult>
): Promise<CommitPipelinesResult> {
  return shas.length === 0 ? Promise.resolve({ available: true, runsBySha: {} }) : lookup()
}

export async function getCommitPipelines(
  context: ForgeProviderRepositoryContext,
  shas: readonly string[],
  deps: CommitPipelinesDeps = {}
): Promise<CommitPipelinesResult> {
  const resolveBitbucketRepo = deps.resolveBitbucketRepo ?? resolveBitbucketRepoFromContext
  const getBitbucketPipelines = deps.getBitbucketPipelines ?? getBitbucketCommitPipelines
  const resolveGitHubRepo = deps.resolveGitHubRepo ?? resolveGitHubRepoFromContext
  const getGitHubChecks = deps.getGitHubChecks ?? getGitHubCommitChecks

  // Why: Bitbucket first; it is almost every efront repo and its check is a local URL parse.
  const bitbucketRepo = await resolveBitbucketRepo(context)
  if (bitbucketRepo) {
    return lookupUnlessEmpty(shas, () => getBitbucketPipelines(bitbucketRepo, shas))
  }
  const githubRepo = await resolveGitHubRepo(context)
  if (githubRepo) {
    const githubContext = {
      repoPath: context.repoPath,
      connectionId: context.connectionId,
      localGitOptions: context.localGitExecOptions
    }
    return lookupUnlessEmpty(shas, () => getGitHubChecks(githubContext, githubRepo, shas))
  }
  return { available: false, reason: 'no-provider' }
}
