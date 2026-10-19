// Title and lead paragraph of an ExitPlanMode plan, as plain text for the
// plan review card. The full plan stays in the transcript's tool row.

export const PLAN_REVIEW_TOOL_NAME = 'ExitPlanMode'

export function isPlanReviewTool(toolName: string | undefined): boolean {
  return toolName === PLAN_REVIEW_TOOL_NAME
}

/** Strip the markdown a one-line preview can't show: markers, emphasis, links, code ticks. */
function plainLine(line: string): string {
  return line
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|~~|`)/g, '')
    .trim()
}

export function planSummary(input: unknown): { title: string; description: string } {
  const plan =
    input && typeof input === 'object' && typeof (input as { plan?: unknown }).plan === 'string'
      ? (input as { plan: string }).plan
      : ''
  const lines = plan.split(/\r?\n/)
  let cursor = 0
  let title = ''
  while (cursor < lines.length && title === '') {
    title = plainLine(lines[cursor] ?? '')
    cursor += 1
  }
  // The lead paragraph: the next run of non-blank lines, skipping fences and rules.
  const paragraph: string[] = []
  for (; cursor < lines.length; cursor += 1) {
    const raw = lines[cursor] ?? ''
    if (/^\s*(```|~~~|-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) {
      if (paragraph.length > 0) {
        break
      }
      continue
    }
    const text = plainLine(raw)
    if (text === '') {
      if (paragraph.length > 0) {
        break
      }
      continue
    }
    paragraph.push(text)
  }
  return { title, description: paragraph.join(' ') }
}
