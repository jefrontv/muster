// Human review of an agent's plan, opened by the muster-sites `annotate_plan` tool.
//
// Self-mounted and IPC-driven, like ChatConnectorConfirmDialog: the generic activeModal switchboard
// has no producers outside renderer-originated interaction, and an agent-initiated dialog needs to
// appear without one. Reviews queue rather than collide, because two agents (or one, since
// annotate_plan runs off the server's dispatch chain) can ask at once, and a dropped request is a
// review the user did for nothing.
//
// Annotation is inline: select a passage, comment on it where it sits, and the passage stays
// highlighted for the rest of the review. Notes listed away from the text lose the thing they are
// about the moment the document is longer than a screen.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { Check, MessageSquare, Copy, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type {
  PlanAnnotationDecision,
  PlanAnnotationRequest,
  PlanAnnotationResult
} from '../../../../shared/plan-annotation-types'
import { PlanAnnotationComposer, type ComposerAnchor } from './PlanAnnotationComposer'
import { PlanAnnotationDocument } from './PlanAnnotationDocument'
import { PlanAnnotationNoteList } from './PlanAnnotationNoteList'
import { clearDraft, draftKey, loadDraft, saveDraft } from './plan-annotation-drafts'
import {
  clearPlanHighlights,
  findRangeForQuote,
  paintPlanHighlights
} from './plan-annotation-highlights'
import {
  createNote,
  previewFeedback,
  readSelectionAnchor,
  sortNotes,
  toAnnotations,
  type DraftNote
} from './plan-annotation-notes'

export function PlanAnnotationDialog(): React.JSX.Element | null {
  const [queue, setQueue] = useState<PlanAnnotationRequest[]>([])
  const [notes, setNotes] = useState<DraftNote[]>([])
  const [composer, setComposer] = useState<ComposerAnchor | null>(null)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const scroller = useRef<HTMLDivElement | null>(null)
  const document_ = useRef<HTMLDivElement | null>(null)
  // Live Ranges cannot be serialized into a draft, so they are kept beside the notes and rebuilt
  // from the quote when a draft is restored.
  const rangesById = useRef(new Map<string, Range>())
  const pendingRange = useRef<Range | null>(null)

  useEffect(
    () => window.api.planAnnotation.onRequest((request) => setQueue((q) => [...q, request])),
    []
  )

  // Why: a review can be queued before this window existed, and without this the agent waits out
  // the whole timeout for a modal nobody ever saw.
  useEffect(() => {
    void window.api.planAnnotation
      .listPending()
      .then((pending) =>
        setQueue((q) => [
          ...q,
          ...pending.filter((p) => !q.some((entry) => entry.requestId === p.requestId))
        ])
      )
      .catch(() => undefined)
  }, [])

  const current = queue[0] ?? null
  const key = current ? draftKey(current) : null

  useEffect(() => {
    rangesById.current.clear()
    setNotes(key ? loadDraft(key) : [])
    setComposer(null)
    setActiveNoteId(null)
    setShowPreview(false)
    return () => clearPlanHighlights()
  }, [key])

  useEffect(() => {
    if (key) {
      saveDraft(key, notes)
    }
  }, [key, notes])

  // Rebuild any missing Range (restored draft) and repaint, after the document has rendered.
  useEffect(() => {
    const root = document_.current
    if (!root) {
      return
    }
    for (const note of notes) {
      if (note.kind === 'global' || rangesById.current.has(note.id)) {
        continue
      }
      const range = findRangeForQuote(root, note.quote, note.startLine)
      if (range) {
        rangesById.current.set(note.id, range)
      }
    }
    const ranges = notes
      .map((note) => rangesById.current.get(note.id))
      .filter((range): range is Range => range !== undefined)
    paintPlanHighlights({
      ranges,
      activeRange: activeNoteId ? (rangesById.current.get(activeNoteId) ?? null) : null
    })
  }, [notes, activeNoteId, current?.content])

  const openComposer = useCallback(() => {
    const selection = window.getSelection()
    const parsed = readSelectionAnchor(selection)
    if (!parsed || !selection) {
      return
    }
    const range = selection.getRangeAt(0)
    pendingRange.current = range.cloneRange()
    const rect = range.getBoundingClientRect()
    setComposer({
      quote: parsed.quote,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
    })
  }, [])

  const saveNote = useCallback(
    (body: string) => {
      const selectionAnchor = composer ? { quote: composer.quote, startLine: 0, endLine: 0 } : null
      const resolved = readSelectionAnchorFromRange(pendingRange.current) ?? selectionAnchor
      if (!resolved) {
        return
      }
      const note = createNote({ kind: 'comment', body, anchor: resolved })
      if (pendingRange.current) {
        rangesById.current.set(note.id, pendingRange.current)
      }
      setNotes((existing) => [...existing, note])
      setComposer(null)
      pendingRange.current = null
      window.getSelection()?.removeAllRanges()
    },
    [composer]
  )

  const removeNote = useCallback((id: string) => {
    rangesById.current.delete(id)
    setNotes((existing) => existing.filter((note) => note.id !== id))
  }, [])

  const addGlobal = useCallback(() => {
    const body = window.prompt('Comment on the whole plan')
    if (body && body.trim().length > 0) {
      setNotes((existing) => [...existing, createNote({ kind: 'global', body, anchor: null })])
    }
  }, [])

  const settle = useCallback(
    (decision: PlanAnnotationDecision) => {
      if (!current) {
        return
      }
      const result: PlanAnnotationResult = {
        decision,
        annotations: decision === 'dismissed' ? [] : toAnnotations(notes)
      }
      void window.api.planAnnotation
        .respond({ requestId: current.requestId, result })
        .catch(() => undefined)
      if (key) {
        clearDraft(key)
      }
      clearPlanHighlights()
      setQueue((q) => q.slice(1))
    },
    [current, key, notes]
  )

  const sorted = useMemo(() => sortNotes(notes), [notes])

  if (!current) {
    return null
  }

  const waiting = queue.length - 1
  const bounds = scroller.current?.getBoundingClientRect() ?? null

  return (
    <Dialog open onOpenChange={(next) => !next && settle('dismissed')}>
      <DialogContent className="flex h-[88vh] w-[min(1200px,calc(100vw-4rem))] flex-col gap-0 p-0 sm:max-w-[1200px]">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border/70 px-4 py-2.5">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate">{current.title}</span>
            {current.round > 1 ? (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                round {current.round}
              </span>
            ) : null}
            {waiting > 0 ? (
              <span className="shrink-0 text-[11px] font-normal text-muted-foreground">
                {waiting} more waiting
              </span>
            ) : null}
          </DialogTitle>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" onClick={addGlobal}>
              <MessageSquare className="size-3.5" />
              Global comment
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void navigator.clipboard.writeText(current.content)}
            >
              <Copy className="size-3.5" />
              Copy plan
            </Button>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <div
            ref={scroller}
            className="min-w-0 flex-1 overflow-y-auto px-10 py-6"
            onMouseUp={openComposer}
          >
            <PlanAnnotationDocument ref={document_} content={current.content} />
          </div>

          <PlanAnnotationNoteList
            notes={sorted}
            previewText={showPreview ? previewFeedback(notes) : null}
            activeNoteId={activeNoteId}
            onTogglePreview={() => setShowPreview((shown) => !shown)}
            onFocusNote={setActiveNoteId}
            onRemoveNote={removeNote}
          />
        </div>

        {composer && bounds ? (
          <PlanAnnotationComposer
            anchor={composer}
            bounds={bounds}
            onCancel={() => {
              setComposer(null)
              pendingRange.current = null
            }}
            onSave={saveNote}
          />
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-border/70 px-4 py-3">
          <Button variant="ghost" onClick={() => settle('dismissed')}>
            Close
          </Button>
          <Button
            variant="outline"
            onClick={() => settle(notes.length > 0 ? 'approved_with_notes' : 'approved')}
          >
            <Check className="size-4" />
            {notes.length > 0 ? 'Approve with notes' : 'Approve'}
          </Button>
          <Button disabled={notes.length === 0} onClick={() => settle('annotated')}>
            <Send className="size-4" />
            Send feedback
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Re-reads the anchor off the stored Range, so the saved lines match the highlighted text. */
function readSelectionAnchorFromRange(
  range: Range | null
): { quote: string; startLine: number; endLine: number } | null {
  if (!range) {
    return null
  }
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  const parsed = readSelectionAnchor(selection)
  return parsed
}
