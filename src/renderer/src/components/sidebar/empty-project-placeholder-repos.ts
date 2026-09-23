import type { Repo, Worktree } from '../../../../shared/types'
import type { WorktreeGroupBy } from './worktree-list-groups'

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
  detectedWorktreesByRepo?: Readonly<Record<string, unknown>>
}): Set<string> {
  if (args.groupBy !== 'repo') {
    return new Set()
  }

  const filterSet = args.filterRepoIds.length > 0 ? new Set(args.filterRepoIds) : null
  const visibleRepoIds = new Set(args.visibleWorktrees.map((worktree) => worktree.repoId))
  const placeholderRepoIds = new Set<string>()
  for (const repo of args.repos) {
    if (filterSet && !filterSet.has(repo.id)) {
      continue
    }
    const loaded =
      args.worktreesByRepo[repo.id] !== undefined ||
      args.detectedWorktreesByRepo?.[repo.id] !== undefined
    const hasNoWorktrees =
      (args.worktreesByRepo[repo.id]?.length ?? 0) === 0 && (loaded || !args.hideUnloaded)
    // Why: workspace filters hide cards, but must not rewrite the visible
    // membership of a persisted Project Group. #8865
    const isFilteredProjectGroupMember = repo.projectGroupId != null && !visibleRepoIds.has(repo.id)
    if (hasNoWorktrees || isFilteredProjectGroupMember) {
      placeholderRepoIds.add(repo.id)
    }
  }
  return placeholderRepoIds
}
