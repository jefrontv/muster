// Submit path for the composer's "Open" tab: activate the project's existing
// main checkout on whatever branch it is on — no git mutations — and make sure
// something is running in it.

import type { TuiAgent } from '../../../../shared/types'
import { resolveProjectDefaultWorkspaceId } from '@/components/cmd-j/palette-project-activation'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'

export type OpenExistingWorkspaceOutcome = 'opened' | 'no-checkout'

export function openExistingWorkspaceCheckout(args: {
  repoId: string
  /** Agent to launch when the workspace has nothing open; null opens a terminal. */
  agent: TuiAgent | null
}): OpenExistingWorkspaceOutcome {
  const state = useAppStore.getState()
  const worktreeId = resolveProjectDefaultWorkspaceId(args.repoId, state.worktreesByRepo)
  if (!worktreeId) {
    return 'no-checkout'
  }
  // The opened row IS the default-branch workspace; leaving this filter on
  // would hide what the user just asked to see (same move as the add-project
  // handoff).
  if (state.hideDefaultBranchWorkspace) {
    state.setHideDefaultBranchWorkspace(false)
  }
  activateAndRevealWorktree(worktreeId)
  const tabs = useAppStore.getState().tabsByWorktree[worktreeId] ?? []
  if (tabs.length > 0) {
    // Existing tabs: activation's sleeping-session resume owns the wake-up.
    return 'opened'
  }
  if (
    args.agent &&
    launchAgentInNewTab({
      agent: args.agent,
      worktreeId,
      groupId: worktreeId,
      launchSource: 'new_workspace_composer'
    })
  ) {
    return 'opened'
  }
  void useAppStore.getState().openNewTerminalTabInActiveWorkspace(worktreeId)
  return 'opened'
}

/** The checkout the Open tab would activate, for the modal's summary line. */
export function describeExistingWorkspaceCheckout(
  repoId: string | null
): { worktreeId: string; path: string; branch: string } | null {
  if (!repoId) {
    return null
  }
  const state = useAppStore.getState()
  const worktreeId = resolveProjectDefaultWorkspaceId(repoId, state.worktreesByRepo)
  if (!worktreeId) {
    return null
  }
  const worktree = (state.worktreesByRepo[repoId] ?? []).find((entry) => entry.id === worktreeId)
  if (!worktree) {
    return null
  }
  return { worktreeId, path: worktree.path, branch: worktree.branch ?? '' }
}
