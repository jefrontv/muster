export type OnboardingRemapSnapshot = {
  flowVersion: number
  lastCompletedStep: number
  outcome?: 'completed' | 'dismissed' | null
}

/**
 * Map a persisted last-completed index onto the current wizard numbering.
 * lastCompletedStep is the 1-based step just finished, which is also the
 * 0-based index of the page to resume on.
 */
export function remapOnboardingLastCompletedStep(
  snapshot: OnboardingRemapSnapshot,
  current: { flowVersion: number; finalStep: number }
): number {
  const { lastCompletedStep, outcome } = snapshot
  if (snapshot.flowVersion === current.flowVersion) {
    return lastCompletedStep
  }
  if (outcome === 'completed' && lastCompletedStep >= 4) {
    return current.finalStep
  }

  const v4 = remapLegacyProgressToV4(snapshot.flowVersion, lastCompletedStep)
  // Why: v5 inserted default_view at step 3, so anything that had already
  // finished integrations-or-later in v4 must shift forward one slot.
  if (current.flowVersion >= 5 && v4 >= 3) {
    return Math.min(v4 + 1, current.finalStep)
  }
  return v4
}

function remapLegacyProgressToV4(flowVersion: number, lastCompletedStep: number): number {
  // v4 is the five-step numbering: agent, theme, integrations, windows, notifications.
  if (flowVersion === 4) {
    return lastCompletedStep
  }
  // v3 (four-step, pre-Windows-terminal) step 4 already meant notifications.
  if (flowVersion === 3) {
    return Math.min(4, lastCompletedStep)
  }
  // v2 (five-step) used step 4 for the removed agent-setup page, not integrations.
  if (flowVersion === 2) {
    if (lastCompletedStep === 3) {
      return 2
    }
    if (lastCompletedStep >= 4) {
      return 3
    }
    return lastCompletedStep
  }
  // Unversioned seven-step: steps 3–4 were pages that no longer exist.
  if (lastCompletedStep === 3 || lastCompletedStep === 4) {
    return 2
  }
  if (lastCompletedStep >= 5) {
    return 3
  }
  return lastCompletedStep
}
