// Plan notes in the shape the markdown viewer's review machinery reads.
//
// The rail positioning, card stacking, highlight lookup and click-to-card routing all take
// DiffComment[]. Mapping drafts onto that shape lets the plan review reuse them unchanged, while
// DraftNote stays the persisted and exported model.

import type { DiffComment } from '../../../../shared/types'
import type { PlanAnnotationKind } from '../../../../shared/plan-annotation-types'
import type { RichMarkdownAnnotationHighlightRange } from '../editor/rich-markdown-annotation-highlight'
import type { DraftNote } from './plan-annotation-notes'

export type PlanReviewComment = DiffComment & {
  planKind: PlanAnnotationKind
  attachments: readonly string[]
}

// Whole-plan cards sort above any passage note that shares the first block's top.
const WHOLE_PLAN_ORDER_BASE = -1e15

export const PLAN_NOTE_KIND_LABEL: Record<PlanAnnotationKind, string> = {
  comment: 'Comment',
  delete: 'Remove',
  looks_good: 'Looks good',
  global: 'Whole plan'
}

export function noteCreatedAt(note: Pick<DraftNote, 'id'>, fallback: number): number {
  const stamp = Number.parseInt(note.id.split('-')[0] ?? '', 10)
  return Number.isFinite(stamp) ? stamp : fallback
}

export function toPlanReviewComment(note: DraftNote, index: number): PlanReviewComment {
  const createdAt = noteCreatedAt(note, index)
  const isGlobal = note.kind === 'global'
  return {
    id: note.id,
    worktreeId: '',
    filePath: '',
    source: 'markdown',
    // Empty for whole-plan notes, so they paint no highlight and anchor to the first block.
    selectedText: isGlobal ? '' : note.quote,
    startLine: isGlobal ? undefined : note.startLine,
    lineNumber: isGlobal ? 1 : note.endLine,
    body: note.body,
    createdAt: isGlobal ? WHOLE_PLAN_ORDER_BASE + createdAt : createdAt,
    side: 'modified',
    planKind: note.kind,
    attachments: note.attachments ?? []
  }
}

export function planNoteTone(
  kind: PlanAnnotationKind
): RichMarkdownAnnotationHighlightRange['tone'] {
  if (kind === 'delete') {
    return 'remove'
  }
  return kind === 'looks_good' ? 'good' : undefined
}

/** A note's kind decides whether it can be saved with no text. */
export function isStandaloneKind(kind: PlanAnnotationKind): boolean {
  return kind === 'delete' || kind === 'looks_good'
}

// Markdown syntax that wraps visible text without being part of it.
function visibleLineText(line: string): string {
  return line
    .replace(/\]\([^)]*\)/g, '')
    .replace(/[*_`~[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Narrows a block's line range to the lines the quote sits on.
 *
 * Why: the editor anchors a selection to its whole top-level block, so a phrase in one list item
 * reports every line of the list. The agent edits by line, so it gets the tightest range we can
 * prove from the text, and the block range when the quote cannot be found on its own lines.
 */
export function narrowLinesToQuote(
  markdown: string,
  range: { startLine: number; endLine: number },
  quote: string
): { startLine: number; endLine: number } {
  const quoteLines = quote
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const first = quoteLines[0]
  const last = quoteLines.at(-1)
  if (!first || !last) {
    return range
  }
  const lines = markdown.split('\n')
  const lineOf = (needle: string, from: number): number | null => {
    for (let line = from; line <= range.endLine; line += 1) {
      if (visibleLineText(lines[line - 1] ?? '').includes(needle)) {
        return line
      }
    }
    return null
  }
  const startLine = lineOf(first, range.startLine)
  const endLine = startLine === null ? null : lineOf(last, startLine)
  return startLine === null || endLine === null ? range : { startLine, endLine }
}
