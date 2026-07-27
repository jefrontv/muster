// Which Muster project an ActiveCollab binding applies to right now.
//
// The Tasks page is a full-window surface with no project of its own, so "the project I am working
// in" has to come from the app around it. The active workspace is that signal — it is what the
// sidebar highlights and what the user means by "this project" — with the last-active repo as the
// fallback for the moments before a workspace is picked.
import type { Project, Worktree } from '../../../shared/types'

export type ActiveCollabBindingTargetInput = {
  projects: readonly Project[]
  /** The active workspace, already resolved from `activeWorktreeId`. */
  activeWorktree: Pick<Worktree, 'projectId' | 'repoId'> | null | undefined
  activeRepoId: string | null | undefined
}

/**
 * Three steps, narrowest first:
 *
 * 1. `worktree.projectId` — authoritative when present.
 * 2. `worktree.repoId` — workspaces created before project ids existed still carry only a repo, and
 *    a folder workspace synthesises a `folder-workspace:<groupId>` repo id that matches no project,
 *    so it falls through rather than binding something arbitrary.
 * 3. `activeRepoId` — the Tasks page can be opened with a repo focused and no workspace active.
 */
export function selectActiveCollabBindingProject({
  projects,
  activeWorktree,
  activeRepoId
}: ActiveCollabBindingTargetInput): Project | null {
  const projectId = activeWorktree?.projectId
  if (projectId) {
    const byId = projects.find((project) => project.id === projectId)
    if (byId) {
      return byId
    }
  }
  const repoId = activeWorktree?.repoId || activeRepoId
  if (!repoId) {
    return null
  }
  return projects.find((project) => project.sourceRepoIds.includes(repoId)) ?? null
}
