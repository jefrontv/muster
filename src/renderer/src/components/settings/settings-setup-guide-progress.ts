import { useMemo } from 'react'
import {
  getFeatureWallSetupSteps,
  getFirstIncompleteFeatureWallSetupStepId,
  type FeatureWallSetupMode,
  type FeatureWallSetupStepId
} from '../../../../shared/feature-wall-setup-steps'
import type { FeatureWallSetupProgress } from '../feature-wall/feature-wall-setup-progress'
import { useSetupGuideProgress } from '../setup-guide/use-setup-guide-progress'

export type SettingsSetupGuideProgress = {
  ready: boolean
  doneCount: number
  total: number
  firstIncompleteStepId: FeatureWallSetupStepId | null
}

export function getSettingsSetupGuideProgress(progress: {
  ready: boolean
  mode?: FeatureWallSetupMode
  stepDone: Partial<Record<FeatureWallSetupStepId, boolean>>
}): SettingsSetupGuideProgress {
  const steps = getFeatureWallSetupSteps(progress.mode)
  const doneCount = steps.filter((step) => progress.stepDone[step.id]).length
  const firstIncompleteStepId =
    doneCount === steps.length
      ? null
      : getFirstIncompleteFeatureWallSetupStepId(progress.stepDone, progress.mode)

  return {
    ready: progress.ready,
    doneCount,
    total: steps.length,
    firstIncompleteStepId
  }
}

export function useSettingsSetupGuideProgress(
  shouldRefreshCoreState: boolean
): SettingsSetupGuideProgress {
  const fullProgress = useSettingsSetupGuideFullProgress(shouldRefreshCoreState)

  return useMemo(() => getSettingsSetupGuideProgress(fullProgress), [fullProgress])
}

export function useSettingsSetupGuideFullProgress(
  shouldRefreshCoreState: boolean
): FeatureWallSetupProgress {
  return useSetupGuideProgress(shouldRefreshCoreState)
}
