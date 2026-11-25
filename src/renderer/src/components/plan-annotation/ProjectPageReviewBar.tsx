// The decision bar pinned below a page while a plan review of that page is open.
import { Check, GitCompareArrows, Send } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type {
  PlanAnnotationDecision,
  PlanAnnotationRequest
} from '../../../../shared/plan-annotation-types'
import { restoreTitleHeading } from '../../../../shared/plan-page-heading'
import { livePageEditor } from '../project-pages/page-editor-registry'
import { loadPageComments, usePageComments } from '../project-pages/use-page-comments'
import { serializePageMarkdown } from './page-review-baseline'
import { buildPageReviewResult, roundThreads, samePlanText } from './page-review-result'
import { popPlanReview } from './use-plan-review-queue'

const firstSeen = new Map<string, number>()

/** When this round opened; older builds of main did not say, so the first sighting stands in. */
function roundStart(review: PlanAnnotationRequest): number {
  if (review.openedAt) {
    return review.openedAt
  }
  const seen = firstSeen.get(review.requestId) ?? Date.now()
  firstSeen.set(review.requestId, seen)
  return seen
}

/** Whether the saved page text differs from the round's plan; formatting noise does not count. */
function useEditedPage(review: PlanAnnotationRequest, scopeKey: string, pageId: string): boolean {
  const [edited, setEdited] = useState(false)
  useEffect(() => {
    let stale = false
    const check = (): void => {
      void window.api.projectPages.read(scopeKey, pageId).then((result) => {
        if (!stale && result.ok) {
          const text = restoreTitleHeading(result.value.markdown, review.content)
          setEdited(!samePlanText(text, review.content))
        }
      })
    }
    check()
    const stop = window.api.projectPages.onChanged((change) => {
      if (change.scopeKey === scopeKey && change.pageId === pageId) {
        check()
      }
    })
    return () => {
      stale = true
      stop()
    }
  }, [review.content, scopeKey, pageId])
  return edited
}

async function settlePageReview(
  review: PlanAnnotationRequest,
  scopeKey: string,
  pageId: string,
  decision: PlanAnnotationDecision
): Promise<void> {
  const live = livePageEditor(scopeKey, pageId)
  await live?.flush()
  let current = live?.markdown() ?? null
  if (current === null) {
    const stored = await window.api.projectPages.read(scopeKey, pageId)
    current = stored.ok ? stored.value.markdown : review.content
  }
  // The page title holds the plan's H1; put it back so the diff and line numbers match the plan.
  current = restoreTitleHeading(current, review.content)
  const baseline =
    current === review.content ? review.content : serializePageMarkdown(review.content, scopeKey)
  const result = buildPageReviewResult({
    request: review,
    decision,
    threads: await loadPageComments(scopeKey, pageId),
    since: roundStart(review),
    baseline,
    current
  })
  await window.api.planAnnotation
    .respond({ requestId: review.requestId, result })
    .catch(() => undefined)
  popPlanReview(review.requestId)
}

export function ProjectPageReviewBar({
  review,
  scopeKey,
  pageId,
  waiting,
  changes,
  onToggleChanges
}: {
  review: PlanAnnotationRequest
  scopeKey: string
  pageId: string
  waiting: number
  changes: boolean
  onToggleChanges: () => void
}): React.JSX.Element {
  const since = roundStart(review)
  const { threads } = usePageComments(scopeKey, pageId)
  const noteCount = roundThreads(threads, since).length
  const edited = useEditedPage(review, scopeKey, pageId)
  const [busy, setBusy] = useState(false)
  const hasFeedback = noteCount > 0 || edited
  const settle = (decision: PlanAnnotationDecision): void => {
    setBusy(true)
    void settlePageReview(review, scopeKey, pageId, decision).finally(() => setBusy(false))
  }
  const summary = [
    noteCount === 1
      ? translate('auto.components.planAnnotation.pageReview.oneNote', '1 note')
      : noteCount > 1
        ? translate('auto.components.planAnnotation.pageReview.notes', '{{count}} notes', {
            count: noteCount
          })
        : null,
    edited ? translate('auto.components.planAnnotation.pageReview.edited', 'edited') : null
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div
      data-page-review-bar=""
      className="flex shrink-0 items-center gap-2 border-t border-border/60 bg-[var(--editor-surface)] px-4 py-2"
    >
      <span className="size-1.5 shrink-0 rounded-full bg-status-attention motion-safe:animate-pulse" />
      <p className="flex min-w-0 flex-1 items-center gap-2 text-[12px]">
        <span className="shrink-0 font-medium text-foreground">
          {translate('auto.components.planAnnotation.pageReview.title', 'Plan review')}
        </span>
        <span className="truncate text-muted-foreground">
          {[review.agent, review.project].filter(Boolean).join(' · ')}
        </span>
        {review.round > 1 ? (
          <Badge variant="muted" className="shrink-0">
            {translate('auto.components.planAnnotation.pageReview.round', 'round {{round}}', {
              round: review.round
            })}
          </Badge>
        ) : null}
        {waiting > 0 ? (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {translate(
              'auto.components.planAnnotation.pageReview.waiting',
              '{{count}} more waiting',
              {
                count: waiting
              }
            )}
          </span>
        ) : null}
      </p>
      <span className="min-w-0 shrink truncate text-[11px] text-muted-foreground">
        {hasFeedback
          ? translate(
              'auto.components.planAnnotation.pageReview.ready',
              '{{summary}}, ready to send',
              {
                summary
              }
            )
          : translate(
              'auto.components.planAnnotation.pageReview.hint',
              'Select text to comment, or edit the page'
            )}
      </span>
      {review.previousContent !== null ? (
        <Button
          variant={changes ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={changes}
          onClick={onToggleChanges}
        >
          <GitCompareArrows className="size-4" />
          {translate('auto.components.planAnnotation.pageReview.changes', 'Changes')}
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => settle('dismissed')}>
        {translate('auto.components.planAnnotation.pageReview.close', 'Close')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => settle(hasFeedback ? 'approved_with_notes' : 'approved')}
      >
        <Check className="size-4" />
        {hasFeedback
          ? translate(
              'auto.components.planAnnotation.pageReview.approveNotes',
              'Approve with notes'
            )
          : translate('auto.components.planAnnotation.pageReview.approve', 'Approve')}
      </Button>
      <Button size="sm" disabled={busy || !hasFeedback} onClick={() => settle('annotated')}>
        <Send className="size-4" />
        {translate('auto.components.planAnnotation.pageReview.send', 'Send feedback')}
      </Button>
    </div>
  )
}
