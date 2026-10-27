import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { OptionalString, requiredString, requiredStringAllowingEmpty } from '../schemas'
import {
  awaitPlanAnnotationResult,
  openPlanAnnotation,
  PLAN_ANNOTATION_TIMEOUT_MS
} from '../../../sites/plan-annotation-requests'
import { formatPlanFeedback } from '../../../sites/plan-review-feedback'
import { describePlanProject, MAX_PLAN_BYTES } from '../../../sites/plan-review-source'

const PlanReviewOpen = z.object({
  planPath: OptionalString,
  title: requiredString('Missing plan title'),
  content: requiredStringAllowingEmpty('Missing plan content'),
  cwd: OptionalString
})

const PlanReviewAwait = z.object({
  reviewId: requiredString('Missing review id'),
  waitMs: z.number().int().min(0).max(PLAN_ANNOTATION_TIMEOUT_MS)
})

// Why: the review window saves direct edits to planPath; a path from an SSH or WSL shell
// may not exist here, or may be a different file, so only a matching local copy keeps it.
function localPlanPath(planPath: string | undefined, content: string): string | null {
  if (!planPath) {
    return null
  }
  try {
    return readFileSync(planPath, 'utf8') === content ? planPath : null
  } catch {
    return null
  }
}

export const PLAN_REVIEW_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'planReview.open',
    params: PlanReviewOpen,
    handler: async (params) => {
      const content = params.content as string
      if (Buffer.byteLength(content, 'utf8') > MAX_PLAN_BYTES) {
        throw new Error('Plan is too large to review.')
      }
      const opened = openPlanAnnotation({
        planPath: localPlanPath(params.planPath, content),
        title: params.title,
        content,
        agent: 'muster annotate',
        project: params.cwd ? describePlanProject(params.cwd, []) : null
      })
      if ('error' in opened) {
        throw new Error('Muster has no window open to show the review. Run `muster open` first.')
      }
      return { reviewId: opened.requestId, round: opened.round, queuedAhead: opened.queuedAhead }
    }
  }),
  defineMethod({
    name: 'planReview.await',
    params: PlanReviewAwait,
    handler: async (params) => {
      const outcome = await awaitPlanAnnotationResult(params.reviewId, params.waitMs)
      if (outcome.status !== 'settled') {
        return outcome
      }
      return {
        status: 'settled' as const,
        decision: outcome.result.decision,
        feedback: formatPlanFeedback(outcome.result),
        annotations: outcome.result.annotations,
        ...(outcome.result.edits ? { edits: outcome.result.edits } : {}),
        ...(outcome.result.reason ? { reason: outcome.result.reason } : {})
      }
    }
  })
]
