// `annotate_plan`: hand a plan to a person, get their marked-up verdict back as the tool result.
//
// Opening returns at once and collecting holds for at most 25s per call, so the agent loops on
// collect, still mid-turn with full context when the verdict lands. Both are `concurrent`: a
// human-length wait must not stall every other sites tool behind it.

import { formatPlanFeedback } from '../plan-review-feedback'
import { describePlanProject, loadPlanText, PlanSourceError } from '../plan-review-source'
import { readNumber, readRequiredString, readString, SiteMcpToolError } from './site-mcp-arguments'
import { siteMcpClientName } from './site-mcp-client-identity'
import type { SiteMcpTool } from './site-mcp-context'
import { HOLD_DEFAULT_SECONDS, HOLD_MAX_SECONDS, holdInSlices } from './site-mcp-held-wait'
import type { PlanReviewOutcome } from './site-mcp-plan-bridge'
import { objectSchema } from './site-mcp-schemas'

type PlanReviewPending = Extract<PlanReviewOutcome, { status: 'pending' }>

/** Kept for callers that size their own waits; see site-mcp-held-wait.ts for why 25s. */
export const COLLECT_DEFAULT_SECONDS = HOLD_DEFAULT_SECONDS
export const COLLECT_MAX_SECONDS = HOLD_MAX_SECONDS

const KEEP_WAITING =
  'Reviews often take 5 to 15 minutes, so pending is normal. Call collect_plan_review again now with the same review_id. Do not open the plan again, ask for a review in chat, end your turn or start the work until it returns a decision.'

function pendingAnswer(reviewId: string, outcome: PlanReviewPending): Record<string, unknown> {
  const queued = (outcome.queuedAhead ?? 0) > 0
  const shownMs = outcome.shownMs ?? (queued ? null : outcome.openedMs)
  return {
    review_id: reviewId,
    status: 'pending',
    user_state: queued ? 'queued' : 'reading',
    ...(queued ? { queued_ahead: outcome.queuedAhead } : {}),
    open_for_seconds: shownMs === null ? 0 : Math.round(shownMs / 1_000),
    message: queued
      ? `The plan is queued behind ${outcome.queuedAhead} other review(s) in Muster and opens when they finish.`
      : 'The plan is open in Muster and the user is reading it.',
    next_step: KEEP_WAITING
  }
}

export const SITE_MCP_PLAN_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'annotate_plan',
    description:
      'Open a markdown plan in Muster for the user to review. Returns a `review_id` at once without waiting. Then call `collect_plan_review` with that id in a loop until it returns a decision: a review takes minutes, and `pending` in the meantime is normal. Do not end your turn while it is pending. Prefer `path` over `content`: a real file keeps the review stable across revisions, lets the user save edits back to disk, and survives your context being compacted.',
    inputSchema: objectSchema({
      path: {
        type: 'string',
        description:
          'Path to a markdown plan. Relative paths resolve against the working directory.'
      },
      content: {
        type: 'string',
        description: 'Plan markdown, for a plan not yet written to disk. Use `path` when you can.'
      }
    }),
    // Still concurrent: opening is quick, but it must not queue behind a long collect.
    concurrent: true,
    async run(context, args) {
      let plan: { planPath: string | null; title: string; content: string }
      try {
        plan = loadPlanText({
          path: readString(args, 'path'),
          content: readString(args, 'content'),
          cwd: context.cwd
        })
      } catch (error) {
        throw error instanceof PlanSourceError ? new SiteMcpToolError(error.message) : error
      }

      // Why round and previousContent are not sent: the queue counts rounds for every transport,
      // and a second counter here would restart at 1 the moment another transport opened the plan.
      const opened = await context.annotatePlan({
        planPath: plan.planPath,
        title: plan.title,
        content: plan.content,
        agent: siteMcpClientName(),
        project: describePlanProject(context.cwd, context.store.listSites())
      })

      return {
        review_id: opened.requestId,
        round: opened.round,
        plan_path: plan.planPath,
        status: 'open',
        next_step: `The plan is open in Muster. Call collect_plan_review with review_id "${opened.requestId}" and keep calling it until it returns a decision. Reviews often take 5 to 15 minutes; each call answers "pending" while the user reads.`
      }
    }
  },
  {
    name: 'collect_plan_review',
    description:
      'Collect the verdict for a review opened by `annotate_plan`. Waits up to `wait_seconds` (default 25) and returns `status: "pending"` while the user is still reading. Pending is normal and can go on for many minutes: call it again straight away, as many times as it takes, and never sleep, re-open the plan or ask for a review in chat instead. On completion returns `decision` (annotated = revise and open a new review, approved = proceed, approved_with_notes = proceed using the notes, dismissed = no feedback given) plus their notes and any direct edits. `status: "unknown"` means the id was never issued or has expired: stop polling.',
    inputSchema: objectSchema({
      review_id: {
        type: 'string',
        description: 'The review_id returned by annotate_plan.'
      },
      wait_seconds: {
        type: 'number',
        description: `How long to wait before answering "pending". Default ${COLLECT_DEFAULT_SECONDS}, max ${COLLECT_MAX_SECONDS}. Only raise it if your client's request timeout is longer.`
      }
    }),
    // A person is the latency here; blocking the dispatch chain would stall every other sites tool.
    concurrent: true,
    async run(context, args) {
      const reviewId = readRequiredString(args, 'review_id')
      const waitSeconds = readNumber(
        args,
        'wait_seconds',
        COLLECT_DEFAULT_SECONDS,
        COLLECT_MAX_SECONDS
      )
      const outcome = await holdInSlices({
        context,
        waitSeconds,
        attempt: (waitMs) => context.collectPlanReview({ reviewId, waitMs }),
        done: (answer) => answer.status !== 'pending',
        describe: () => 'Waiting for the user to review the plan'
      })

      if (outcome.status === 'unknown') {
        return {
          review_id: reviewId,
          status: 'unknown',
          message:
            'No such review. It was never opened, or its verdict has expired — do not keep polling; open a new review if you still need one.'
        }
      }
      if (outcome.status === 'pending') {
        return pendingAnswer(reviewId, outcome)
      }
      return {
        review_id: reviewId,
        status: 'settled',
        decision: outcome.result.decision,
        feedback: formatPlanFeedback(outcome.result),
        annotations: outcome.result.annotations,
        ...(outcome.result.edits ? { edits: outcome.result.edits } : {}),
        ...(outcome.result.reason ? { reason: outcome.result.reason } : {})
      }
    }
  }
]
