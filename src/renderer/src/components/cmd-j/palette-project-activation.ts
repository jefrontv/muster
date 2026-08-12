import type { Worktree } from '../../../../shared/types'

/** The workspace a project row opens: its main checkout, else whatever it has.
 *  Why not reveal-only: a sleeping project has no sidebar row to reveal under the
 *  hide-sleeping filter, so selecting it looked like nothing happened. */
export function resolveProjectDefaultWorkspaceId(
  repoId: string,
  worktreesByRepo: Readonly<Record<string, readonly Worktree[]>>
): string | null {
  const worktrees = (worktreesByRepo[repoId] ?? []).filter((worktree) => !worktree.isArchived)
  const target = worktrees.find((worktree) => worktree.isMainWorktree) ?? worktrees[0]
  return target?.id ?? null
}
