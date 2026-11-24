// The plan review tab's body: the front review when it belongs here, else a closed state.

import type React from 'react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { OpenFile } from '@/store/slices/editor'
import { PlanReviewSession } from './PlanReviewSession'
import { popPlanReview, usePlanReviewFront } from './use-plan-review-queue'

export default function PlanReviewTab({ file }: { file: OpenFile }): React.JSX.Element {
  const { current, waiting } = usePlanReviewFront()
  const closeFile = useAppStore((s) => s.closeFile)

  if (!current || current.requestId !== file.planReview?.requestId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>{translate('auto.components.planAnnotation.tab.ended', 'This review has ended.')}</p>
        <Button variant="outline" size="sm" onClick={() => closeFile(file.id)}>
          {translate('auto.components.planAnnotation.tab.close', 'Close tab')}
        </Button>
      </div>
    )
  }

  return (
    <PlanReviewSession
      key={current.requestId}
      current={current}
      waiting={waiting}
      variant="tab"
      onSettled={() => popPlanReview(current.requestId)}
    />
  )
}
