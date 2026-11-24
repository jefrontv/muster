import { isPathInsideOrEqual } from '../../../../shared/cross-platform-path'
import type { PlanAnnotationRequest } from '../../../../shared/plan-annotation-types'

/**
 * The worktree a review belongs to: the deepest one holding the agent's folder, else the plan file.
 * Deepest wins because nested worktrees (a checkout inside a project folder) both contain the path.
 */
export function matchPlanReviewWorktree(
  request: Pick<PlanAnnotationRequest, 'cwd' | 'planPath'>,
  worktrees: readonly { id: string; path: string }[]
): string | null {
  for (const candidate of [request.cwd, request.planPath]) {
    if (!candidate) {
      continue
    }
    let best: { id: string; path: string } | null = null
    for (const worktree of worktrees) {
      if (
        isPathInsideOrEqual(worktree.path, candidate) &&
        (!best || worktree.path.length > best.path.length)
      ) {
        best = worktree
      }
    }
    if (best) {
      return best.id
    }
  }
  return null
}
