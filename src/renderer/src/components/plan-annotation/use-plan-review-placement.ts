// Decides where the front plan review shows: on its Pages page, in a plan-review tab, or the popup.
// Routed reviews never take focus; a toast and the tab's attention dot announce them, and main
// sends an OS notification when the review lands somewhere the user is not looking.
import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { PlanAnnotationRequest } from '../../../../shared/plan-annotation-types'
import { buildProjectPagesTabId } from '../project-pages/project-pages-tab'
import { planReviewWorktree } from './plan-review-worktree-match'
import {
  planReviewOnScreen,
  useWindowFocused,
  worktreeShowsPlanReview
} from './plan-review-visibility'
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

/** Opens the review in its worktree; false when no review tab came of it. */
function placeInWorktree(
  worktreeId: string,
  request: PlanAnnotationRequest,
  page: boolean
): boolean {
  const state = useAppStore.getState()
  if (page && request.page) {
    state.openProjectPagesReview(worktreeId, request.page.scopeKey, request.page.pageId)
  } else {
    state.openPlanReviewTab(worktreeId, request)
  }
  return worktreeShowsPlanReview(useAppStore.getState().unifiedTabsByWorktree, worktreeId)
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
  const activeView = useAppStore((s) => s.activeView)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const windowFocused = useWindowFocused()
  // A review whose tab could not be made falls back to the popup, so it never blocks the queue.
  const [unplaceable, setUnplaceable] = useState<string | null>(null)
  const matchedWorktreeId = useMemo(() => {
    // A plan already on a page opens there even when path reviews use the popup.
    if (!current || (!inTab && !(current.page && pagesOn))) {
      return null
    }
    return planReviewWorktree(current, Object.values(worktreesByRepo).flat(), pagesOn)
  }, [current, inTab, pagesOn, worktreesByRepo])
  const worktreeId = current && unplaceable === current.requestId ? null : matchedWorktreeId
  const placement: PlanReviewPlacement = !worktreeId
    ? 'dialog'
    : current?.page && pagesOn
      ? 'page'
      : 'tab'
  const announced = useRef<string | null>(null)
  const reported = useRef<string | null>(null)

  useEffect(() => {
    const state = useAppStore.getState()
    if (current && worktreeId && sessionReady) {
      if (!placeInWorktree(worktreeId, current, placement === 'page')) {
        setUnplaceable(current.requestId)
        return
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

  // Tells main whether the user can see the review, for collect_plan_review and the notification.
  const placed = Boolean(current && (placement === 'dialog' || sessionReady))
  const onScreen = planReviewOnScreen({
    dialog: placement === 'dialog',
    worktreeId,
    activeView,
    activeWorktreeId,
    windowFocused
  })
  useEffect(() => {
    const key = current ? `${current.requestId}:${placement}:${onScreen}` : null
    if (!current || !placed || reported.current === key) {
      return
    }
    reported.current = key
    void window.api.planAnnotation
      .shown({ requestId: current.requestId, onScreen })
      .catch(() => undefined)
  }, [current, placement, placed, onScreen])

  // Clicking the notification brings the review forward.
  useEffect(
    () =>
      window.api.planAnnotation.onReveal((requestId) => {
        if (current?.requestId === requestId && worktreeId) {
          focusPlanReviewTab(worktreeId, current)
        }
      }),
    [current, worktreeId]
  )

  return placement
}
