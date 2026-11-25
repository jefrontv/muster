// Wraps the page area: the review bar below it, and the round's changes over it when asked.
import type React from 'react'
import { lazy, Suspense, useState } from 'react'
import { ProjectPageReviewBar } from './ProjectPageReviewBar'
import { usePlanReviewFront } from './use-plan-review-queue'

const PlanReviewChangesView = lazy(() => import('./PlanReviewChangesView'))

export function ProjectPageReviewFrame({
  scopeKey,
  pageId,
  children
}: {
  scopeKey: string
  pageId: string | null
  children: React.ReactNode
}): React.JSX.Element {
  const { current, waiting } = usePlanReviewFront()
  const [changesFor, setChangesFor] = useState<string | null>(null)
  const review =
    current?.page && current.page.scopeKey === scopeKey && current.page.pageId === pageId
      ? current
      : null
  const showChanges = review !== null && changesFor === review.requestId
  return (
    <>
      {/* Always this wrapper, so the editor inside stays mounted as reviews come and go. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {children}
        {showChanges && review.previousContent !== null ? (
          <div className="absolute inset-0 z-20 flex flex-col bg-background">
            <Suspense fallback={null}>
              <PlanReviewChangesView
                requestId={review.requestId}
                previous={review.previousContent}
                current={review.content}
              />
            </Suspense>
          </div>
        ) : null}
      </div>
      {/* A footer below the scroll area, like the plan review footer: always visible, never over the text. */}
      {review && pageId ? (
        <ProjectPageReviewBar
          key={review.requestId}
          review={review}
          scopeKey={scopeKey}
          pageId={pageId}
          waiting={waiting}
          changes={showChanges}
          onToggleChanges={() => setChangesFor(showChanges ? null : review.requestId)}
        />
      ) : null}
    </>
  )
}
