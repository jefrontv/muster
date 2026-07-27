// Which Muster project the CURRENT Tasks view corresponds to.
//
// REPORTING ONLY. A binding is set from the project the user pointed at — the sidebar's project
// actions menu — so this no longer decides where a write lands. The Tasks page is a full-window
// surface with no project of its own, so it still has to name the project scoping the list and
// pre-target the bar's bind shortcut. The active workspace is that signal — it is what the sidebar
// highlights and what the user means by "this project" — with the last-active repo as the fallback
// for the moments before a workspace is picked.
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
  return selectProjectForRepoId(projects, activeWorktree?.repoId || activeRepoId)
}

/**
 * The Muster project a repo row belongs to. The sidebar's project header IS a repo row, so this is
 * the one rule every entry point resolves through: the reporting fallback above, the sidebar menu
 * that names its target, and the bind dialog that writes to it.
 *
 * `projects` is tolerated as nullish on purpose. This runs inside the sidebar's per-row render, and
 * the projects slice can be absent before it hydrates — a bare `.find` there took the whole
 * WorktreeList down with "Cannot read properties of undefined". A sidebar must not fail to draw
 * because an unrelated slice has not arrived; the honest answer while it is missing is "no project
 * yet", which is exactly `null`.
 */
export function selectProjectForRepoId(
  projects: readonly Project[] | null | undefined,
  repoId: string | null | undefined
): Project | null {
  if (!repoId || !projects) {
    return null
  }
  return projects.find((project) => project.sourceRepoIds.includes(repoId)) ?? null
}
