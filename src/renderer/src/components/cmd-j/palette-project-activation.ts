import type { Repo, Worktree } from '../../../../shared/types'
import { filterEnabledTuiAgents } from '../../../../shared/tui-agent-selection'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { useAppStore } from '@/store'

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

/** The workspace a group row opens: the first member repo (sidebar order) that
 *  has any workspace. Same rationale as the project row — reveal-only is a
 *  visible no-op when every member is sleeping-filtered. */
export function resolveProjectGroupDefaultWorkspaceId(
  groupId: string,
  repos: readonly Repo[],
  worktreesByRepo: Readonly<Record<string, readonly Worktree[]>>
): string | null {
  const members = repos
    .filter((repo) => repo.projectGroupId === groupId)
    .sort(
      (left, right) =>
        (left.projectGroupOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.projectGroupOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.displayName.localeCompare(right.displayName)
    )
  for (const repo of members) {
    const worktreeId = resolveProjectDefaultWorkspaceId(repo.id, worktreesByRepo)
    if (worktreeId) {
      return worktreeId
    }
  }
  return null
}

/**
 * After palette activation, guarantee the workspace shows something. A
 * workspace whose last terminal the user closed keeps an empty persisted tab
 * row, which the initial-terminal path reads as "leave it closed" — correct
 * for passive activation, but a palette pick is explicit intent to work there,
 * so launch the default agent (or a plain terminal) into the emptiness.
 */
export function ensurePalettePickedWorkspaceOpens(worktreeId: string): void {
  const state = useAppStore.getState()
  if ((state.tabsByWorktree[worktreeId] ?? []).length > 0) {
    // Existing tabs: activation's sleeping-session resume owns the wake-up.
    return
  }
  const preference = state.settings?.defaultTuiAgent
  // null/undefined preference means auto: first enabled locally-detected agent
  // (matching the quick-launch ordering); 'blank' is an explicit terminal choice.
  const agent =
    preference === 'blank'
      ? null
      : (preference ??
        filterEnabledTuiAgents(
          state.detectedAgentIds ?? [],
          state.settings?.disabledTuiAgents
        )[0] ??
        null)
  if (agent) {
    const launched = launchAgentInNewTab({
      agent,
      worktreeId,
      groupId: worktreeId,
      launchSource: 'workspace_jump_palette'
    })
    if (launched) {
      return
    }
  }
  void state.openNewTerminalTabInActiveWorkspace(worktreeId)
}
