// `annotate_plan`: hand a plan to a person, get their marked-up verdict back as the tool result.
//
// The call blocks while they read. That is the feature — the agent is still mid-turn holding full
// context when the feedback lands, so a revise-and-resubmit loop needs no reconnection. It is also
// why the tool is `concurrent`: a human-length call must not stall every other sites tool behind it.

import { readFileSync } from 'node:fs'
import { basename, isAbsolute, resolve } from 'node:path'
import type { PlanAnnotation, PlanAnnotationResult } from '../../../shared/plan-annotation-types'
import {
  readNumber,
  readRequiredString,
  readString,
  SiteMcpToolError,
  type ToolArguments
} from './site-mcp-arguments'
import { siteMcpClientName } from './site-mcp-client-identity'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { objectSchema } from './site-mcp-schemas'

/**
 * What the plan is about, for the review header.
 *
 * The deepest matching site wins, so a worktree nested under a site root resolves to that site
 * rather than to a shorter path that happens to share a prefix. A checkout Muster does not manage
 * is not an error here — the directory name is still more use to a reviewer than nothing.
 */
function describeProject(context: SiteMcpContext): string | null {
  const cwd = context.cwd
  let best: { path: string; name: string } | null = null
  for (const site of context.store.listSites()) {
    const root = site.path
    if (root.length === 0) {
      continue
    }
    const inside = cwd === root || cwd.startsWith(root.endsWith('/') ? root : `${root}/`)
    if (!inside) {
      continue
    }
    if (best === null || root.length > best.path.length) {
      best = { path: root, name: site.displayName }
    }
  }
  return best?.name ?? basename(cwd) ?? null
}

/** Refuses a file that is clearly not a plan before showing a person a wall of binary. */
const MAX_PLAN_BYTES = 1_000_000

/**
 * Rounds and prior text, keyed by absolute plan path, for the life of this MCP process.
 *
 * Why in-process: one process serves one agent, so this is exactly the scope of "this agent's
 * ongoing review of this plan". An inline plan has no stable key and always reads as round 1.
 */
const roundsByPlanPath = new Map<string, { round: number; content: string }>()

function loadPlan(
  context: SiteMcpContext,
  args: ToolArguments
): { planPath: string | null; title: string; content: string } {
  const path = readString(args, 'path')
  const inline = readString(args, 'content')
  if (path.length > 0 && inline.length > 0) {
    throw new SiteMcpToolError("Pass either 'path' or 'content', not both.")
  }
  if (path.length === 0 && inline.length === 0) {
    throw new SiteMcpToolError("Pass 'path' to a markdown file, or 'content' with the plan text.")
  }
  if (inline.length > 0) {
    return { planPath: null, title: 'Plan', content: inline }
  }
  const absolute = isAbsolute(path) ? path : resolve(context.cwd, path)
  let content: string
  try {
    content = readFileSync(absolute, 'utf-8')
  } catch {
    throw new SiteMcpToolError(`Cannot read plan at ${absolute}.`)
  }
  if (content.length > MAX_PLAN_BYTES) {
    throw new SiteMcpToolError(`Plan at ${absolute} is too large to review.`)
  }
  return { planPath: absolute, title: basename(absolute), content }
}

function describeAnnotation(annotation: PlanAnnotation): string {
  // Absolute paths: the agent opens the image itself, rather than being handed its bytes.
  const files = (annotation.attachments ?? []).map((path) => `\n  Attached: ${path}`).join('')
  if (annotation.kind === 'global') {
    return `- **General:** ${annotation.body}${files}`
  }
  const where =
    annotation.startLine === annotation.endLine
      ? `line ${annotation.startLine}`
      : `lines ${annotation.startLine}-${annotation.endLine}`
  const head =
    annotation.kind === 'delete'
      ? `**Remove** (${where})`
      : annotation.kind === 'looks_good'
        ? `**Looks good** (${where})`
        : `**Comment** (${where})`
  // The quote is what actually locates the passage after the plan is rewritten; the line is a hint.
  const quote = annotation.quote.trim()
  const quoted = quote.length > 0 ? `\n  > ${quote.replace(/\n/g, '\n  > ')}` : ''
  const body = annotation.body.trim()
  return `- ${head}${quoted}${body.length > 0 ? `\n  ${body}` : ''}${files}`
}

/** Renders the result as the markdown the agent reads, so it never has to parse the JSON itself. */
export function formatPlanFeedback(result: PlanAnnotationResult): string {
  const lines: string[] = []
  if (result.annotations.length > 0) {
    lines.push(...result.annotations.map(describeAnnotation))
  }
  if (result.edits) {
    lines.push(
      '',
      result.edits.appliedToDisk
        ? '**Direct edits — already saved to the plan file, do not re-apply:**'
        : '**Direct edits — apply these:**',
      '```diff',
      result.edits.unifiedDiff.trimEnd(),
      '```'
    )
  }
  if (lines.length === 0) {
    return result.decision === 'approved' ? 'Approved with no changes requested.' : 'No feedback.'
  }
  return lines.join('\n')
}

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
      const { planPath, title, content } = loadPlan(context, args)
      const prior = planPath ? roundsByPlanPath.get(planPath) : undefined
      const round = (prior?.round ?? 0) + 1

      const opened = await context.annotatePlan({
        planPath,
        title,
        content,
        agent: siteMcpClientName(),
        project: describeProject(context),
        round,
        previousContent: prior?.content ?? null
      })

      if (planPath) {
        roundsByPlanPath.set(planPath, { round, content })
      }

      return {
        review_id: opened.requestId,
        round,
        plan_path: planPath,
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

/** Test-only: forget round history so cases do not leak into each other. */
export function clearPlanRoundsForTests(): void {
  roundsByPlanPath.clear()
}
