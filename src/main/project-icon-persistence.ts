import type { Project, Repo } from '../shared/types'
import type { RepoIcon } from '../shared/repo-icon'
import { getProjectIdentityKey } from '../shared/project-host-setup-projection'

function sameRepoIcon(a: RepoIcon | null | undefined, b: RepoIcon | null | undefined): boolean {
  if (a === b) {
    return true
  }
  if (!a || !b || a.type !== b.type) {
    return false
  }
  if (a.type === 'image' && b.type === 'image') {
    return a.src === b.src && a.source === b.source && a.label === b.label && a.tint === b.tint
  }
  if (a.type === 'emoji' && b.type === 'emoji') {
    return a.emoji === b.emoji
  }
  return a.type === 'lucide' && b.type === 'lucide' && a.name === b.name
}

/**
 * Drops `repoIcon` from projects that are a projection of their first source repo.
 * Why: every load re-projects those projects from repos, so persisting the icon a second
 * time only doubled inline image bytes in each save (2.2 of 3.2 MB on a real profile).
 * Independent projects keep theirs because nothing re-derives it.
 */
export function omitProjectedProjectIcons(
  projects: readonly Project[],
  repos: readonly Repo[]
): Project[] {
  let reposById: Map<string, Repo> | null = null
  return projects.map((project) => {
    if (project.repoIcon === undefined) {
      return project
    }
    reposById ??= new Map(repos.map((repo) => [repo.id, repo]))
    const sourceRepo = reposById.get(project.sourceRepoIds[0] ?? '')
    if (
      !sourceRepo ||
      getProjectIdentityKey(sourceRepo) !== project.id ||
      !sameRepoIcon(sourceRepo.repoIcon, project.repoIcon)
    ) {
      return project
    }
    const { repoIcon: _derivedFromRepo, ...rest } = project
    return rest
  })
}
