// Note collection for a plan review, plus the export text the reviewer can inspect before sending.
//
// Kept out of the dialog so the anchoring rules are testable without mounting Radix.

import type { PlanAnnotation, PlanAnnotationKind } from '../../../../shared/plan-annotation-types'

/** Marks the block a selection landed in. Set by the renderer on every top-level markdown node. */
export const LINE_START_ATTRIBUTE = 'data-plan-line-start'
export const LINE_END_ATTRIBUTE = 'data-plan-line-end'

export type DraftNote = PlanAnnotation & { id: string }

/**
 * Conventional-Comments style verbs a reviewer can stamp without writing prose.
 *
 * Why a fixed set: they exist so a reviewer can be precise in one click, and an open vocabulary
 * would just be freeform text with extra steps.
 */
export const QUICK_LABELS = ['scope', 'test', 'risk', 'question', 'nit'] as const

export type SelectionAnchor = {
  quote: string
  startLine: number
  endLine: number
}

function readLine(element: Element | null, attribute: string): number | null {
  const raw = element?.getAttribute(attribute)
  const parsed = raw === null || raw === undefined ? Number.NaN : Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Resolves the current selection to a quote plus the source lines it came from.
 *
 * Why walk up to the nearest annotated block rather than trusting the selection's own nodes: a
 * selection can start mid-word inside an inline element that carries no position of its own, and
 * `react-markdown` only gives us source positions on the block nodes.
 */
export function readSelectionAnchor(selection: Selection | null): SelectionAnchor | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null
  }
  const quote = selection.toString().trim()
  if (quote.length === 0) {
    return null
  }
  const range = selection.getRangeAt(0)
  const startHost = closestAnnotatedBlock(range.startContainer)
  const endHost = closestAnnotatedBlock(range.endContainer) ?? startHost
  const startLine = readLine(startHost, LINE_START_ATTRIBUTE)
  const endLine = readLine(endHost, LINE_END_ATTRIBUTE) ?? startLine
  if (startLine === null || endLine === null) {
    return null
  }
  return { quote, startLine, endLine: Math.max(startLine, endLine) }
}

function closestAnnotatedBlock(node: Node | null): Element | null {
  const element = node instanceof Element ? node : (node?.parentElement ?? null)
  return element?.closest(`[${LINE_START_ATTRIBUTE}]`) ?? null
}

export function createNote(args: {
  kind: PlanAnnotationKind
  body: string
  anchor: SelectionAnchor | null
  label?: string
}): DraftNote {
  const isGlobal = args.kind === 'global' || args.anchor === null
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: isGlobal ? 'global' : args.kind,
    quote: isGlobal ? '' : args.anchor!.quote,
    startLine: isGlobal ? 0 : args.anchor!.startLine,
    endLine: isGlobal ? 0 : args.anchor!.endLine,
    body: args.body.trim(),
    ...(args.label ? { label: args.label } : {})
  }
}

/** Source order, so the agent reads feedback top-to-bottom; globals last. */
export function sortNotes(notes: readonly DraftNote[]): DraftNote[] {
  return [...notes].sort((a, b) => {
    if (a.kind === 'global' && b.kind !== 'global') {
      return 1
    }
    if (b.kind === 'global' && a.kind !== 'global') {
      return -1
    }
    return a.startLine - b.startLine
  })
}

export function toAnnotations(notes: readonly DraftNote[]): PlanAnnotation[] {
  return sortNotes(notes).map(({ id: _id, ...annotation }) => annotation)
}

/**
 * The markdown the agent will receive.
 *
 * Why show this at all: the reviewer is writing input for a machine they cannot see, so being able
 * to read it back before committing is what makes the feedback trustworthy.
 */
export function previewFeedback(notes: readonly DraftNote[]): string {
  const sorted = sortNotes(notes)
  if (sorted.length === 0) {
    return 'No feedback.'
  }
  return sorted
    .map((note) => {
      if (note.kind === 'global') {
        return `- **General:** ${note.body}`
      }
      const where =
        note.startLine === note.endLine
          ? `line ${note.startLine}`
          : `lines ${note.startLine}-${note.endLine}`
      const head =
        note.kind === 'delete'
          ? `**Remove** (${where})`
          : note.kind === 'looks_good'
            ? `**Looks good** (${where})`
            : note.kind === 'label'
              ? `**${note.label ?? 'note'}** (${where})`
              : `**Comment** (${where})`
      const quoted = note.quote.length > 0 ? `\n  > ${note.quote.replace(/\n/g, '\n  > ')}` : ''
      return `- ${head}${quoted}${note.body.length > 0 ? `\n  ${note.body}` : ''}`
    })
    .join('\n')
}
