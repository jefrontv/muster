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

  // v8 inserted site_sources directly before site_mcp, so site_mcp and
  // everything after it moved one slot later. Someone who had just finished
  // integrations resumes ON the new step rather than past it.
  if (snapshot.flowVersion === 7) {
    return lastCompletedStep >= 5
      ? Math.min(lastCompletedStep + 1, current.finalStep)
      : lastCompletedStep
  }

  // v7 inserted site_mcp after integrations and v8 inserted site_sources before
  // it, so anything past integrations moved two slots. Finishing integrations
  // resumes ON site_sources rather than past it — that is the point of adding it.
  if (snapshot.flowVersion === 6) {
    return lastCompletedStep >= 5
      ? Math.min(lastCompletedStep + 2, current.finalStep)
      : lastCompletedStep
  }

  // v6 moved default_view from step 3 to step 1; v5 steps 4-6 kept their
  // numbers, so only the two later insertions shift anything here. Progress that
  // never reached default_view restarts on it (step 1 = index 0).
  if (snapshot.flowVersion === 5) {
    if (lastCompletedStep < 3) {
      return 0
    }
    return lastCompletedStep >= 5
      ? Math.min(lastCompletedStep + 2, current.finalStep)
      : lastCompletedStep
  }

  const v4 = remapLegacyProgressToV4(snapshot.flowVersion, lastCompletedStep)
  // Three insertions sit behind v4's numbering: default_view ahead of
  // integrations (v5), then site_mcp (v7) and site_sources (v8) after it.
  // Finishing integrations lands on site_sources (one shift); anything later
  // clears all three.
  if (v4 >= 4) {
    return Math.min(v4 + 3, current.finalStep)
  }
  if (v4 === 3) {
    return Math.min(v4 + 1, current.finalStep)
  }
  return 0
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
