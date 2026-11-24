// The heads-up when a review opens as a tab: what is waiting and from whom, without taking focus.

import type React from 'react'
import { ClipboardCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
  const details = planReviewToastDetails(request)
  return (
    <div className="flex w-[var(--width)] gap-3 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-status-attention-background text-status-attention">
        <ClipboardCheck className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-xs text-muted-foreground">
            {translate('auto.components.planAnnotation.tabToast.title', 'Plan ready for review')}
            {waiting > 0
              ? ` · ${translate('auto.components.planAnnotation.tabToast.waiting', '{{value0}} more waiting', { value0: waiting })}`
              : ''}
          </p>
          <button
            type="button"
            aria-label={translate('auto.components.planAnnotation.tabToast.dismiss', 'Dismiss')}
            className="-mt-0.5 -mr-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => toast.dismiss(toastId)}
          >
            <X className="size-3.5" />
          </button>
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm font-medium">{request.title}</p>
        {details.length > 0 ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{details.join(' · ')}</p>
        ) : null}
        <div className="mt-2.5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => toast.dismiss(toastId)}>
            {translate('auto.components.planAnnotation.tabToast.later', 'Later')}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              toast.dismiss(toastId)
              onReview()
            }}
          >
            {translate('auto.components.planAnnotation.tabToast.review', 'Review plan')}
          </Button>
        </div>
      </div>
    </div>
  )
}
