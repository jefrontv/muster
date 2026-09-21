import type { GitHubRepositoryIdentity, Repo } from '../../../../shared/types'
import { callRuntimeRpc, type getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'

type RuntimeTarget = ReturnType<typeof getActiveRuntimeTarget>

function resolveRepositoryIdentityLive(
  runtimeTarget: RuntimeTarget,
  repo: Repo,
  method: 'github.repoUpstream' | 'github.repoSlug',
  localCall: (args: {
    repoPath: string
    repoId: string
  }) => Promise<GitHubRepositoryIdentity | null>
): Promise<GitHubRepositoryIdentity | null> {
  return runtimeTarget.kind === 'environment'
    ? callRuntimeRpc<GitHubRepositoryIdentity | null>(
        runtimeTarget,
        method,
        { repo: repo.id },
        { timeoutMs: 30_000 }
      )
    : localCall({ repoPath: repo.path, repoId: repo.id })
}

export function resolveRepositoryUpstreamLive(
  runtimeTarget: RuntimeTarget,
  repo: Repo
): Promise<GitHubRepositoryIdentity | null> {
  return resolveRepositoryIdentityLive(runtimeTarget, repo, 'github.repoUpstream', (args) =>
    window.api.gh.repoUpstream(args)
  )
}
