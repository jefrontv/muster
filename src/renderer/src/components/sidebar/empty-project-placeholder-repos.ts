import type { Repo, Worktree } from '../../../../shared/types'
import type { WorktreeGroupBy } from './worktree-list-groups'

function isLocalRepo(repo: Repo): boolean {
  return !repo.connectionId && (repo.executionHostId ?? 'local') === 'local'
}

export function getEmptyProjectPlaceholderRepoIds(args: {
  groupBy: WorktreeGroupBy
  repos: readonly Repo[]
  worktreesByRepo: Readonly<Record<string, readonly Worktree[] | undefined>>
  visibleWorktrees: readonly Worktree[]
  filterRepoIds: readonly string[]
  /**
   * Hide-sleeping during startup: a repo whose list has not loaded yet is unknown, not empty.
   * Showing it as a placeholder painted every project and then removed them one by one.
   */
  hideUnloaded?: boolean
  /** Local repos keep waiting after the fallback releases remote ones: a local list always arrives. */
  hideUnloadedLocal?: boolean
  detectedWorktreesByRepo?: Readonly<Record<string, unknown>>
}): Set<string> {
  if (args.groupBy !== 'repo') {
    return new Set()
  }

  const filterSet = args.filterRepoIds.length > 0 ? new Set(args.filterRepoIds) : null
  const visibleRepoIds = new Set(args.visibleWorktrees.map((worktree) => worktree.repoId))
  const placeholderRepoIds = new Set<string>()
  for (const repo of args.repos) {
    // A deleted folder lists no worktrees, which used to paint it as an empty project.
    if (repo.pathMissing || (filterSet && !filterSet.has(repo.id))) {
      continue
    }
    const loaded =
      args.worktreesByRepo[repo.id] !== undefined ||
      args.detectedWorktreesByRepo?.[repo.id] !== undefined
    const hideIfUnloaded = args.hideUnloaded || (args.hideUnloadedLocal && isLocalRepo(repo))
    const hasNoWorktrees =
      (args.worktreesByRepo[repo.id]?.length ?? 0) === 0 && (loaded || !hideIfUnloaded)
    // Why: workspace filters hide cards, but must not rewrite the visible
    // membership of a persisted Project Group. #8865
    const isFilteredProjectGroupMember = repo.projectGroupId != null && !visibleRepoIds.has(repo.id)
    if (hasNoWorktrees || isFilteredProjectGroupMember) {
      placeholderRepoIds.add(repo.id)
    }
  }
  return placeholderRepoIds
}
