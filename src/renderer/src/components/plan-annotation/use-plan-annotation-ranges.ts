// Live DOM Ranges for the notes on a plan, and the highlights painted from them.
//
// Ranges live here rather than in note state because they cannot be serialized into a draft: a
// restored review has notes but no ranges, so each one is rebuilt from its quote once the document
// has rendered.

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import {
  findRangeForQuote,
  paintPlanHighlights,
  type HighlightTone
} from './plan-annotation-highlights'
import type { DraftNote } from './plan-annotation-notes'

/** Kind decides how a passage reads at a glance, so removals can be scanned for without opening one. */
function toneFor(note: DraftNote): HighlightTone {
  if (note.kind === 'delete') {
    return 'remove'
  }
  return note.kind === 'looks_good' ? 'good' : 'note'
}

export function usePlanAnnotationRanges(args: {
  notes: readonly DraftNote[]
  activeNoteId: string | null
  documentRef: RefObject<HTMLDivElement | null>
  /** Repaints when the document itself changes, e.g. after a direct edit. */
  content: string | undefined
}): {
  rangesById: RefObject<Map<string, Range>>
  /** Which saved note, if any, covers this point — so clicking highlighted text reopens it. */
  noteAtPoint: (x: number, y: number) => string | null
} {
  const { notes, activeNoteId, documentRef, content } = args
  const rangesById = useRef(new Map<string, Range>())

  useEffect(() => {
    const root = documentRef.current
    if (!root) {
      return
    }
    for (const note of notes) {
      if (note.kind === 'global' || rangesById.current.has(note.id)) {
        continue
      }
      const rebuilt = findRangeForQuote(root, note.quote, note.startLine)
      if (rebuilt) {
        rangesById.current.set(note.id, rebuilt)
      }
    }
    const byTone: Record<HighlightTone, Range[]> = { note: [], remove: [], good: [] }
    for (const note of notes) {
      const range = rangesById.current.get(note.id)
      if (range) {
        byTone[toneFor(note)].push(range)
      }
    }
    paintPlanHighlights({
      byTone,
      activeRange: activeNoteId ? (rangesById.current.get(activeNoteId) ?? null) : null
    })
  }, [notes, activeNoteId, content, documentRef])

  const noteAtPoint = useCallback(
    (x: number, y: number): string | null => {
      for (const note of notes) {
        const range = rangesById.current.get(note.id)
        if (!range) {
          continue
        }
        for (const rect of range.getClientRects()) {
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return note.id
          }
        }
      }
      return null
    },
    [notes]
  )

  return { rangesById, noteAtPoint }
}
