// Decides where the front plan review shows: on its Pages page, in a plan-review tab, or the popup.
// Routed reviews never take focus; a toast and the tab's attention dot announce them.
import { createElement, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { PlanAnnotationRequest } from '../../../../shared/plan-annotation-types'
import type { Worktree } from '../../../../shared/types'
import { buildProjectPagesTabId } from '../project-pages/project-pages-tab'
import { matchPlanReviewWorktree } from './plan-review-worktree-match'
import { PlanReviewToast } from './PlanReviewToast'

export type PlanReviewPlacement = 'dialog' | 'tab' | 'page'

function pagesEnabled(): boolean {
  return useAppStore.getState().settings?.experimentalProjectPages === true
}

export function focusPlanReviewTab(worktreeId: string, request: PlanAnnotationRequest): void {
  const state = useAppStore.getState()
  state.setActiveView('terminal')
  activateAndRevealWorktree(worktreeId)
  if (request.page && pagesEnabled()) {
    state.openProjectPagesReview(worktreeId, request.page.scopeKey, request.page.pageId, {
      focus: true
    })
    return
  }
  state.openPlanReviewTab(worktreeId, request, { focus: true })
}

/** A page review belongs in a worktree of the page's own project when the match is elsewhere. */
function pageWorktree(
  request: PlanAnnotationRequest,
  matched: string | null,
  worktrees: Worktree[]
): string | null {
  const repoId = request.page?.scopeKey.startsWith('repo:')
    ? request.page.scopeKey.slice('repo:'.length)
    : null
  if (!repoId || worktrees.find((w) => w.id === matched)?.repoId === repoId) {
    return matched
  }
  return worktrees.find((w) => w.repoId === repoId)?.id ?? matched
}

/** Clears the review dot from Pages tabs that no longer show the front review. */
function clearStalePageReviews(keepWorktreeId: string | null): void {
  const state = useAppStore.getState()
  for (const [worktreeId, tabs] of Object.entries(state.unifiedTabsByWorktree ?? {})) {
    for (const tab of tabs) {
      const stale =
        tab.contentType === 'project-pages' &&
        tab.attention === 'review' &&
        (worktreeId !== keepWorktreeId || tab.entityId !== buildProjectPagesTabId(worktreeId))
      if (stale) {
        state.setTabAttention(tab.id, null)
      }
    }
  }
}

export function usePlanReviewPlacement(
  current: PlanAnnotationRequest | null,
  waiting: number
): PlanReviewPlacement {
  const inTab = useAppStore((s) => s.settings?.planReviewInProjectTab !== false)
  const pagesOn = useAppStore((s) => s.settings?.experimentalProjectPages === true)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  // Session restore replaces the tab list, so a tab opened before it would vanish after a reload.
  const sessionReady = useAppStore((s) => s.workspaceSessionReady)
  const worktreeId = useMemo(() => {
    if (!current || !inTab) {
      return null
    }
    const worktrees = Object.values(worktreesByRepo).flat()
    const matched = matchPlanReviewWorktree(current, worktrees)
    return current.page && pagesOn ? pageWorktree(current, matched, worktrees) : matched
  }, [current, inTab, pagesOn, worktreesByRepo])
  const placement: PlanReviewPlacement = !worktreeId
    ? 'dialog'
    : current?.page && pagesOn
      ? 'page'
      : 'tab'
  const announced = useRef<string | null>(null)

  useEffect(() => {
    const state = useAppStore.getState()
    if (current && worktreeId && sessionReady) {
      if (placement === 'page' && current.page) {
        state.openProjectPagesReview(worktreeId, current.page.scopeKey, current.page.pageId)
      } else {
        state.openPlanReviewTab(worktreeId, current)
      }
      if (announced.current !== current.requestId) {
        announced.current = current.requestId
        toast.custom(
          (id) =>
            createElement(PlanReviewToast, {
              toastId: id,
              request: current,
              waiting,
              onReview: () => focusPlanReviewTab(worktreeId, current)
            }),
          { duration: 15_000 }
        )
      }
    }
    clearStalePageReviews(placement === 'page' ? worktreeId : null)
    for (const file of state.openFiles) {
      const live = placement === 'tab' && file.planReview?.requestId === current?.requestId
      if (file.mode === 'plan-review' && !live) {
        state.closeFile(file.id)
      }
    }
  }, [current, worktreeId, waiting, placement, sessionReady])

  return placement
}
