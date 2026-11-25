// Sidebar markers for a plan waiting in a project's review tab, so it is findable from anywhere.

import type React from 'react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { focusPlanReviewTab } from './use-plan-review-placement'
import { usePlanReviewFront } from './use-plan-review-queue'

function useWorktreeHasPlanReview(worktreeId: string): boolean {
  return useAppStore((s) =>
    (s.unifiedTabsByWorktree?.[worktreeId] ?? []).some((tab) => tab.attention === 'review')
  )
}

function PulseDot(): React.JSX.Element {
  return <span className="size-1.5 rounded-full bg-status-attention motion-safe:animate-pulse" />
}

export function WorktreePlanReviewBadge({
  worktreeId
}: {
  worktreeId: string
}): React.JSX.Element | null {
  const waiting = useWorktreeHasPlanReview(worktreeId)
  const { current } = usePlanReviewFront()
  if (!waiting || !current) {
    return null
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="attention"
          role="button"
          tabIndex={0}
          data-plan-review-marker=""
          className="shrink-0 cursor-pointer gap-1"
          onClick={(event) => {
            event.stopPropagation()
            focusPlanReviewTab(worktreeId, current)
          }}
        >
          <PulseDot />
          {translate('auto.components.planAnnotation.sidebar.review', 'Review')}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {translate(
          'auto.components.planAnnotation.sidebar.reviewTooltip',
          'Plan waiting: {{value0}}',
          {
            value0: current.title
          }
        )}
      </TooltipContent>
    </Tooltip>
  )
}

/** On the Code switch, so a review waiting in a project tab is visible from Chat and Bots. */
export function CodeModePlanReviewDot(): React.JSX.Element | null {
  const waiting = useAppStore((s) =>
    Object.values(s.unifiedTabsByWorktree ?? {}).some((tabs) =>
      tabs.some((tab) => tab.attention === 'review')
    )
  )
  if (!waiting) {
    return null
  }
  return (
    <span
      data-plan-review-marker=""
      aria-label={translate(
        'auto.components.planAnnotation.sidebar.projectDot',
        'Plan waiting for review'
      )}
      className="flex shrink-0 items-center"
    >
      <PulseDot />
    </span>
  )
}

/** Worktree ids are `${repoId}::${path}`, so a prefix finds every worktree of the project. */
export function ProjectPlanReviewDot({
  repoId
}: {
  repoId: string | undefined
}): React.JSX.Element | null {
  const waiting = useAppStore((s) =>
    repoId
      ? Object.entries(s.unifiedTabsByWorktree ?? {}).some(
          ([worktreeId, tabs]) =>
            worktreeId.startsWith(`${repoId}::`) && tabs.some((tab) => tab.attention === 'review')
        )
      : false
  )
  if (!waiting) {
    return null
  }
  return (
    <span
      data-plan-review-marker=""
      aria-label={translate(
        'auto.components.planAnnotation.sidebar.projectDot',
        'Plan waiting for review'
      )}
      className="flex shrink-0 items-center"
    >
      <PulseDot />
    </span>
  )
}
