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
/**
 * The review's worktree: the agent's own project first, then the reviewed page's project, then the
 * plan file. The page or file can sit in another project, and a review routed there is one nobody sees.
 */
export function planReviewWorktree(
  request: Pick<PlanAnnotationRequest, 'cwd' | 'planPath' | 'page'>,
  worktrees: readonly { id: string; path: string; repoId: string }[],
  pagesOn: boolean
): string | null {
  const byCwd = matchPlanReviewWorktree({ cwd: request.cwd, planPath: null }, worktrees)
  if (byCwd) {
    return byCwd
  }
  const scopeKey = pagesOn ? request.page?.scopeKey : undefined
  const pageRepo = scopeKey?.startsWith('repo:') ? scopeKey.slice('repo:'.length) : null
  const byPage = pageRepo ? worktrees.find((w) => w.repoId === pageRepo)?.id : undefined
  return byPage ?? matchPlanReviewWorktree({ cwd: null, planPath: request.planPath }, worktrees)
}
