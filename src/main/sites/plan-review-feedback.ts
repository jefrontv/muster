// Markdown rendering of a plan verdict, for the agent that asked for the review.
//
// Shared because two transports return the same thing: the MCP tool (`collect_plan_review`) and
// the agent-hooks routes the OMP/PI extension uses. An agent should read identical feedback
// whichever door it came through, so the wording lives in one place.

import type { PlanAnnotation, PlanAnnotationResult } from '../../shared/plan-annotation-types'

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
