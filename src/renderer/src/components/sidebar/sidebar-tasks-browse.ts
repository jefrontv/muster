import { isGitRepoKind } from '../../../../shared/repo-kind'
import type { Repo } from '../../../../shared/types'

export function canBrowseSidebarTasks(args: {
  repos: readonly Pick<Repo, 'kind'>[]
  activeCollabConfigured: boolean
}): boolean {
  // ActiveCollab is not repo-scoped. A fresh profile with no git project still has a Tasks surface
  // once the instance is connected — locking on `isGitRepoKind` left the nav dead after login.
  return args.activeCollabConfigured || args.repos.some((repo) => isGitRepoKind(repo))
}
