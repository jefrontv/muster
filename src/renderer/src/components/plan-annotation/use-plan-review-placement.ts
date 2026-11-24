// Where the front review shows: a tab in the agent's project, or the popup when no project
// matches or the user turned tabs off.

import { createElement, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { PlanAnnotationRequest } from '../../../../shared/plan-annotation-types'
import { matchPlanReviewWorktree } from './plan-review-worktree-match'
import { PlanReviewToast } from './PlanReviewToast'

export function focusPlanReviewTab(worktreeId: string, request: PlanAnnotationRequest): void {
  const state = useAppStore.getState()
  state.setActiveView('terminal')
  activateAndRevealWorktree(worktreeId)
  state.openPlanReviewTab(worktreeId, request, { focus: true })
}

export function usePlanReviewPlacement(
  current: PlanAnnotationRequest | null,
  waiting: number
): 'dialog' | 'tab' {
  const inTab = useAppStore((s) => s.settings?.planReviewInProjectTab !== false)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const worktreeId = useMemo(
    () =>
      current && inTab
        ? matchPlanReviewWorktree(current, Object.values(worktreesByRepo).flat())
        : null,
    [current, inTab, worktreesByRepo]
  )
  const announced = useRef<string | null>(null)

  useEffect(() => {
    const state = useAppStore.getState()
    if (current && worktreeId) {
      state.openPlanReviewTab(worktreeId, current)
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
    // A settled or timed-out review leaves its tab behind; the next review reuses or closes it.
    for (const file of state.openFiles) {
      if (file.mode === 'plan-review' && file.planReview?.requestId !== current?.requestId) {
        state.closeFile(file.id)
      }
    }
  }, [current, worktreeId, waiting])

  return worktreeId ? 'tab' : 'dialog'
}
