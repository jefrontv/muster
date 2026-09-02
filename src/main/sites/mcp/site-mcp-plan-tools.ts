// `annotate_plan`: hand a plan to a person, get their marked-up verdict back as the tool result.
//
// The call blocks while they read. That is the feature — the agent is still mid-turn holding full
// context when the feedback lands, so a revise-and-resubmit loop needs no reconnection. It is also
// why the tool is `concurrent`: a human-length call must not stall every other sites tool behind it.

import { readFileSync } from 'node:fs'
import { basename, isAbsolute, resolve } from 'node:path'
import type { PlanAnnotation, PlanAnnotationResult } from '../../../shared/plan-annotation-types'
import { readString, SiteMcpToolError, type ToolArguments } from './site-mcp-arguments'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { objectSchema } from './site-mcp-schemas'

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

export const SITE_MCP_PLAN_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'annotate_plan',
    description:
      'Open a markdown plan in Muster for the user to review, and return their annotations. Blocks until they decide, so call it at a handoff point and act on the result. Prefer `path` over `content`: a real file keeps the review stable across revisions, lets the user save edits back to disk, and survives your context being compacted. Returns `decision` (annotated = revise and call again, approved = proceed, approved_with_notes = proceed using the notes, dismissed = no feedback given).',
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
    // A person is the latency here; blocking the dispatch chain would stall every other sites tool.
    concurrent: true,
    async run(context, args) {
      const { planPath, title, content } = loadPlan(context, args)
      const prior = planPath ? roundsByPlanPath.get(planPath) : undefined
      const round = (prior?.round ?? 0) + 1

      const result = await context.annotatePlan({
        planPath,
        title,
        content,
        round,
        previousContent: prior?.content ?? null
      })

      if (planPath) {
        roundsByPlanPath.set(planPath, { round, content })
      }

      return {
        decision: result.decision,
        round,
        plan_path: planPath,
        feedback: formatPlanFeedback(result),
        annotations: result.annotations,
        ...(result.edits ? { edits: result.edits } : {}),
        ...(result.reason ? { reason: result.reason } : {})
      }
    }
  }
]

/** Test-only: forget round history so cases do not leak into each other. */
export function clearPlanRoundsForTests(): void {
  roundsByPlanPath.clear()
}
