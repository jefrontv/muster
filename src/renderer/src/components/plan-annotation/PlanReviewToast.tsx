// The heads-up when a review opens as a tab: what is waiting and from whom, without taking focus.

import type React from 'react'
import { ClipboardCheck } from 'lucide-react'
import { ActionToast } from '@/components/toasts/ActionToast'
import { translate } from '@/i18n/i18n'
import type { PlanAnnotationRequest } from '../../../../shared/plan-annotation-types'

/** "claude-code" reads as "Claude Code"; MCP client names arrive kebab-cased. */
function agentLabel(agent: string): string {
  return agent.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function planReviewToastDetails(request: PlanAnnotationRequest): string[] {
  const sections = (request.content.match(/^#{1,3}\s/gm) ?? []).length
  return [
    request.agent ? agentLabel(request.agent) : null,
    request.project,
    request.round > 1
      ? translate('auto.components.planAnnotation.tabToast.round', 'Round {{value0}}', {
          value0: request.round
        })
      : null,
    sections > 1
      ? translate('auto.components.planAnnotation.tabToast.sections', '{{value0}} sections', {
          value0: sections
        })
      : null
  ].filter((part): part is string => Boolean(part))
}

export function PlanReviewToast({
  toastId,
  request,
  waiting,
  onReview
}: {
  toastId: string | number
  request: PlanAnnotationRequest
  waiting: number
  onReview: () => void
}): React.JSX.Element {
  const eyebrow = translate(
    'auto.components.planAnnotation.tabToast.title',
    'Plan ready for review'
  )
  return (
    <ActionToast
      toastId={toastId}
      icon={<ClipboardCheck className="size-4" aria-hidden />}
      eyebrow={
        waiting > 0
          ? `${eyebrow} · ${translate('auto.components.planAnnotation.tabToast.waiting', '+{{value0}} waiting', { value0: waiting })}`
          : eyebrow
      }
      title={request.title}
      meta={planReviewToastDetails(request).join(' · ') || undefined}
      primaryLabel={translate('auto.components.planAnnotation.tabToast.reviewShort', 'Review')}
      onPrimary={onReview}
      secondaryLabel={translate('auto.components.planAnnotation.tabToast.later', 'Later')}
    />
  )
}
