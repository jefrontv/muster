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
import type { ForgeProviderRepositoryContext } from './forge-provider'

export type CommitPipelinesDeps = {
  resolveBitbucketRepo?: (
    context: ForgeProviderRepositoryContext
  ) => Promise<BitbucketRepoRef | null>
  getBitbucketPipelines?: (
    repo: BitbucketRepoRef,
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

export async function getCommitPipelines(
  context: ForgeProviderRepositoryContext,
  shas: readonly string[],
  deps: CommitPipelinesDeps = {}
): Promise<CommitPipelinesResult> {
  const resolveBitbucketRepo = deps.resolveBitbucketRepo ?? resolveBitbucketRepoFromContext
  const getBitbucketPipelines = deps.getBitbucketPipelines ?? getBitbucketCommitPipelines

  const bitbucketRepo = await resolveBitbucketRepo(context)
  if (bitbucketRepo) {
    // Why: nothing on screen yet still answers "available" so the column does not flicker away.
    return shas.length === 0
      ? { available: true, runsBySha: {} }
      : getBitbucketPipelines(bitbucketRepo, shas)
  }
  return { available: false, reason: 'no-provider' }
}
