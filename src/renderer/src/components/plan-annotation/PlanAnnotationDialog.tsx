// Human review of an agent's plan, opened by the muster-sites `annotate_plan` tool.
//
// Self-mounted and IPC-driven, like ChatConnectorConfirmDialog: the generic activeModal switchboard
// has no producers outside renderer-originated interaction, and an agent-initiated dialog needs to
// appear without one. Reviews queue rather than collide, because two agents (or one, since
// annotate_plan runs off the server's dispatch chain) can ask at once, and a dropped request is a
// review the user did for nothing.
//
// By default the review opens as a tab in the agent's project, so it never lands over someone's
// work. The full-window popup remains for reviews no open worktree matches, and when the user
// turns tabs off in Settings → Agent capabilities.

import type React from 'react'
import { PlanReviewSession } from './PlanReviewSession'
import {
  popPlanReview,
  usePlanReviewFront,
  usePlanReviewQueueSubscription
} from './use-plan-review-queue'
import { usePlanReviewPlacement } from './use-plan-review-placement'

export function PlanAnnotationDialog(): React.JSX.Element | null {
  usePlanReviewQueueSubscription()
  const { current, waiting } = usePlanReviewFront()
  const placement = usePlanReviewPlacement(current, waiting)
  if (!current || placement !== 'dialog') {
    return null
  }
  // Keyed per request so every review starts from its own draft, loaded before the editor mounts.
  return (
    <PlanReviewSession
      key={current.requestId}
      current={current}
      waiting={waiting}
      variant="dialog"
      onSettled={() => popPlanReview(current.requestId)}
    />
  )
}
