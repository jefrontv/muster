import type { FeatureInteractionState } from '../../../../shared/feature-interactions'
import { hasFeatureInteraction } from '../../../../shared/feature-interactions'
import {
  getFeatureWallSetupSteps,
  type FeatureWallSetupMode,
  type FeatureWallSetupStepId
} from '../../../../shared/feature-wall-setup-steps'
import type { GlobalSettings, Worktree } from '../../../../shared/types'

export type FeatureWallSetupProgressInput = {
  ready?: boolean
  /** Which checklist to count toward: code (default) or chat. */
  mode?: FeatureWallSetupMode
  settings: GlobalSettings | null
  featureInteractions: FeatureInteractionState
  hasConnectedTaskSource: boolean
  gitRepoCount: number
  worktreesByRepo: Record<string, Worktree[]>
  hasSetupScript: boolean
  chatWorkspaceCount?: number
  chatThreadCount?: number
}

export type FeatureWallSetupProgress = {
  ready: boolean
  mode: FeatureWallSetupMode
  stepDone: Record<FeatureWallSetupStepId, boolean>
  coreDoneCount: number
  coreTotal: number
}

function countAvailableNonMainWorktrees(worktreesByRepo: Record<string, Worktree[]>): number {
  // Why: imported git worktrees count as real parallel-work capacity, but
  // partially hydrated placeholders can appear before a worktree path is known.
  return Object.values(worktreesByRepo).reduce(
    (sum, worktrees) =>
      sum +
      worktrees.filter(
        (worktree) => !worktree.isMainWorktree && typeof worktree.path === 'string' && worktree.path
      ).length,
    0
  )
}

export function getFeatureWallSetupProgress(
  input: FeatureWallSetupProgressInput
): FeatureWallSetupProgress {
  const mode = input.mode ?? 'code'
  const stepDone: Record<FeatureWallSetupStepId, boolean> = {
    'default-agent':
      Boolean(input.settings?.defaultTuiAgent) && input.settings?.defaultTuiAgent !== 'blank',
    'add-two-repos': input.gitRepoCount >= 2,
    notifications:
      input.settings?.notifications.enabled === true &&
      input.settings.notifications.agentTaskComplete === true,
    'two-worktrees': countAvailableNonMainWorktrees(input.worktreesByRepo) >= 1,
    // Why: the 'browser' interaction fires when a non-blank page is viewed, so
    // opening any real page in Orca's browser durably completes this milestone.
    browser: hasFeatureInteraction(input.featureInteractions, 'browser'),
    'task-sources': input.hasConnectedTaskSource,
    'setup-script': input.hasSetupScript,
    'create-first-workspace': (input.chatWorkspaceCount ?? 0) >= 1,
    'start-first-thread': (input.chatThreadCount ?? 0) >= 1
  }
  const activeSteps = getFeatureWallSetupSteps(mode)
  return {
    ready: input.ready ?? true,
    mode,
    stepDone,
    coreDoneCount: activeSteps.filter((step) => stepDone[step.id]).length,
    coreTotal: activeSteps.length
  }
}
