// The plan review tab: one virtual editor tab per worktree, reused by each review in turn.

export type OpenPlanReviewState = {
  requestId: string
}

export function buildPlanReviewTabId(worktreeId: string): string {
  return `${worktreeId}::plan-review`
}

export function planReviewTabLabel(title: string): string {
  return `Review: ${title}`
}
