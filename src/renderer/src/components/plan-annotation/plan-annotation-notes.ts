// Note collection for a plan review, and its conversion to what the agent receives.

import type { PlanAnnotation, PlanAnnotationKind } from '../../../../shared/plan-annotation-types'

export type DraftNote = PlanAnnotation & { id: string }

export type SelectionAnchor = {
  quote: string
  startLine: number
  endLine: number
}

export function createNote(args: {
  kind: PlanAnnotationKind
  body: string
  anchor: SelectionAnchor | null
  attachments?: string[]
}): DraftNote {
  const isGlobal = args.kind === 'global' || args.anchor === null
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: isGlobal ? 'global' : args.kind,
    quote: isGlobal ? '' : args.anchor!.quote,
    startLine: isGlobal ? 0 : args.anchor!.startLine,
    endLine: isGlobal ? 0 : args.anchor!.endLine,
    body: args.body.trim(),
    ...(args.attachments && args.attachments.length > 0 ? { attachments: args.attachments } : {})
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
