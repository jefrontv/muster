// `annotate_plan`: hand a plan to a person, get their marked-up verdict back as the tool result.
//
// The call blocks while they read. That is the feature — the agent is still mid-turn holding full
// context when the feedback lands, so a revise-and-resubmit loop needs no reconnection. It is also
// why the tool is `concurrent`: a human-length call must not stall every other sites tool behind it.

import { formatPlanFeedback } from '../plan-review-feedback'
import { describePlanProject, loadPlanText, PlanSourceError } from '../plan-review-source'
import { readNumber, readRequiredString, readString, SiteMcpToolError } from './site-mcp-arguments'
import { siteMcpClientName } from './site-mcp-client-identity'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { objectSchema } from './site-mcp-schemas'

/**
 * Default and ceiling for a single collect.
 *
 * Why 25 seconds: MCP leaves request timeouts to the client, and most harnesses sit at about 30.
 * A default that fits under the tightest common ceiling is the difference between a review that
 * works everywhere and one cancelled mid-read. A client that resets its clock on progress can ask
 * for far longer, so the cap is generous and only the default is conservative.
 */
const COLLECT_DEFAULT_SECONDS = 25
const COLLECT_MAX_SECONDS = 1_800

/** How often to say "still waiting". Well inside the tightest idle timeouts we know of. */
const KEEPALIVE_INTERVAL_MS = 10_000

/**
 * Runs `work`, telling the client every few seconds that the call is still alive.
 *
 * Why: a client that hears nothing assumes a hung server and cancels. The spec lets it reset that
 * clock on a progress notification, so a review that takes ten minutes survives as one call rather
 * than forcing the agent to poll. No token means no emitter and this is a plain pass-through.
 */
async function withKeepalive<T>(context: SiteMcpContext, work: () => Promise<T>): Promise<T> {
  const progress = context.progress
  if (!progress) {
    return work()
  }
  let ticks = 0
  const timer = setInterval(() => {
    ticks += 1
    progress({
      message: `Waiting for the user to review the plan (${ticks * (KEEPALIVE_INTERVAL_MS / 1_000)}s)`,
      // Monotonic and unbounded on purpose: a human has no total, and the spec only requires
      // progress to increase when no total is given.
      progress: ticks
    })
  }, KEEPALIVE_INTERVAL_MS)
  timer.unref?.()
  try {
    return await work()
  } finally {
    clearInterval(timer)
  }
}

export const SITE_MCP_PLAN_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'annotate_plan',
    description:
      'Open a markdown plan in Muster for the user to review. Returns a `review_id` immediately WITHOUT waiting — then call `collect_plan_review` with that id to get their annotations. Prefer `path` over `content`: a real file keeps the review stable across revisions, lets the user save edits back to disk, and survives your context being compacted.',
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
        next_step: `The plan is on screen. Call collect_plan_review with review_id "${opened.requestId}" to get the verdict. It waits up to ${COLLECT_DEFAULT_SECONDS}s and answers "pending" if the user is still reading — keep calling until it returns a decision.`
      }
    }
  },
  {
    name: 'collect_plan_review',
    description:
      'Collect the verdict for a review opened by `annotate_plan`. Waits up to `wait_seconds` (default 25) and returns `status: "pending"` if the user has not finished — call it again, as many times as it takes. On completion returns `decision` (annotated = revise and open a new review, approved = proceed, approved_with_notes = proceed using the notes, dismissed = no feedback given) plus their notes and any direct edits. `status: "unknown"` means the id was never issued or has expired: stop polling.',
    inputSchema: objectSchema({
      review_id: {
        type: 'string',
        description: 'The review_id returned by annotate_plan.'
      },
      wait_seconds: {
        type: 'number',
        description: `How long to wait before answering "pending". Default ${COLLECT_DEFAULT_SECONDS}, max ${COLLECT_MAX_SECONDS}. Keep it under your client's request timeout.`
      }
    }),
    // A person is the latency here; blocking the dispatch chain would stall every other sites tool.
    concurrent: true,
    async run(context, args) {
      const reviewId = readRequiredString(args, 'review_id')
      // A client that sent a progress token has asked to be kept informed, which is the same
      // capability that lets it hold a call open past its idle timeout. Take it at its word and
      // wait properly instead of making it poll; everyone else gets the conservative default.
      const waitSeconds = readNumber(
        args,
        'wait_seconds',
        context.progress ? COLLECT_MAX_SECONDS : COLLECT_DEFAULT_SECONDS,
        COLLECT_MAX_SECONDS
      )
      const outcome = await withKeepalive(context, () =>
        context.collectPlanReview({ reviewId, waitMs: waitSeconds * 1_000 })
      )

      if (outcome.status === 'unknown') {
        return {
          review_id: reviewId,
          status: 'unknown',
          message:
            'No such review. It was never opened, or its verdict has expired — do not keep polling; open a new review if you still need one.'
        }
      }
      if (outcome.status === 'pending') {
        return {
          review_id: reviewId,
          status: 'pending',
          waiting_for: 'the user to finish reviewing',
          open_for_seconds: Math.round(outcome.openedMs / 1_000),
          next_step: 'Call collect_plan_review again with the same review_id.'
        }
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
