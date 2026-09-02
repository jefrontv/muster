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
  PlanAnnotationKind,
  PlanAnnotationRequest,
  PlanAnnotationResult
} from '../../../../shared/plan-annotation-types'
import { PlanAnnotationComposer, type ComposerAnchor } from './PlanAnnotationComposer'
import { PlanAnnotationDocument } from './PlanAnnotationDocument'
import { PlanAnnotationGlobalNote } from './PlanAnnotationGlobalNote'
import {
  PlanAnnotationViewModes,
  VIEW_MODE_WIDTH,
  type PlanViewMode
} from './PlanAnnotationViewModes'
import { unifiedPlanDiff } from './plan-annotation-diff'
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
  QUICK_LABELS,
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
  const [globalOpen, setGlobalOpen] = useState(false)
  const [viewMode, setViewMode] = useState<PlanViewMode>('reading')
  const [editing, setEditing] = useState(false)
  const [editedContent, setEditedContent] = useState<string | null>(null)

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
    setGlobalOpen(false)
    setEditing(false)
    setEditedContent(null)
    setViewMode('reading')
    return () => clearPlanHighlights()
  }, [key])

  /**
   * Writes the draft at the point of change rather than from an effect on `notes`.
   *
   * Why: an effect keyed on [key, notes] fires once with the NEW key and the OLD notes still in
   * scope, so opening a review saved an empty list over its own draft and erased it. Persisting
   * where the change happens has no such ordering hazard.
   */
  const applyNotes = useCallback(
    (next: DraftNote[]) => {
      setNotes(next)
      if (key) {
        saveDraft(key, next)
      }
    },
    [key]
  )

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
    const pane = scroller.current
    if (!parsed || !selection || !pane) {
      return
    }
    const range = selection.getRangeAt(0)
    pendingRange.current = range.cloneRange()
    const rect = range.getBoundingClientRect()
    const pageRect = pane.getBoundingClientRect()
    // Both rects are captured now rather than read during render: at render time the composer has
    // not been laid out yet, so a rect read then is stale and the box lands somewhere arbitrary.
    setComposer({
      quote: parsed.quote,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      bounds: {
        top: pageRect.top,
        bottom: pageRect.bottom,
        left: pageRect.left,
        right: pageRect.right
      }
    })
  }, [])

  const saveNote = useCallback(
    (kind: PlanAnnotationKind, body: string) => {
      const resolved = readSelectionAnchorFromRange(pendingRange.current)
      if (!resolved) {
        return
      }
      const note = createNote({ kind, body, anchor: resolved })
      if (pendingRange.current) {
        rangesById.current.set(note.id, pendingRange.current)
      }
      applyNotes([...notes, note])
      setComposer(null)
      pendingRange.current = null
      window.getSelection()?.removeAllRanges()
    },
    [applyNotes, notes]
  )

  const removeNote = useCallback(
    (id: string) => {
      rangesById.current.delete(id)
      applyNotes(notes.filter((note) => note.id !== id))
    },
    [applyNotes, notes]
  )

  const addGlobal = useCallback(
    (body: string) => {
      applyNotes([...notes, createNote({ kind: 'global', body, anchor: null })])
      setGlobalOpen(false)
    },
    [applyNotes, notes]
  )

  const settle = useCallback(
    (decision: PlanAnnotationDecision) => {
      if (!current) {
        return
      }
      // Why include the diff: a reviewer who rewrote a passage has already said what they mean
      // more precisely than a comment could. Describing it again would be the worse channel.
      const diff = editedContent === null ? '' : unifiedPlanDiff(current.content, editedContent)
      const result: PlanAnnotationResult = {
        decision,
        annotations: decision === 'dismissed' ? [] : toAnnotations(notes),
        ...(decision !== 'dismissed' && diff.length > 0
          ? { edits: { unifiedDiff: diff, appliedToDisk: false } }
          : {})
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
    [current, editedContent, key, notes]
  )

  const sorted = useMemo(() => sortNotes(notes), [notes])

  if (!current) {
    return null
  }

  const waiting = queue.length - 1

  return (
    <Dialog open onOpenChange={(next) => !next && settle('dismissed')}>
      {/* Why showCloseButton={false}: the built-in × is absolutely positioned at top-right and
          lands on top of the header actions. Close lives in the footer with the other decisions. */}
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(88vh,900px)] w-[min(1180px,calc(100vw-4rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1180px]"
      >
        <DialogHeader className="flex-row items-center gap-3 border-b border-border/60 px-4 py-2.5">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-[13px] font-medium">
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
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <PlanAnnotationViewModes
              mode={viewMode}
              editing={editing}
              onModeChange={setViewMode}
              onToggleEdit={() => {
                setEditing((was) => {
                  if (!was && editedContent === null) {
                    setEditedContent(current.content)
                  }
                  return !was
                })
                setComposer(null)
              }}
            />
            <span className="h-4 w-px bg-border" />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={editing}
              onClick={() => setGlobalOpen((open) => !open)}
            >
              <MessageSquare className="size-3.5" />
              Global comment
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => void navigator.clipboard.writeText(editedContent ?? current.content)}
            >
              <Copy className="size-3.5" />
              Copy plan
            </Button>
          </div>
        </DialogHeader>

        {globalOpen ? (
          <PlanAnnotationGlobalNote onCancel={() => setGlobalOpen(false)} onSave={addGlobal} />
        ) : null}

        <div className="flex min-h-0 flex-1">
          <div
            ref={scroller}
            className="min-w-0 flex-1 overflow-y-auto"
            // Why gated on editing: a selection inside the textarea is a text cursor, not an
            // annotation, and popping a composer over the caret makes editing impossible.
            onMouseUp={editing ? undefined : openComposer}
          >
            <div className={`mx-auto w-full px-10 py-8 ${VIEW_MODE_WIDTH[viewMode]}`}>
              {editing ? (
                <textarea
                  value={editedContent ?? current.content}
                  onChange={(event) => setEditedContent(event.target.value)}
                  spellCheck={false}
                  className="min-h-[60vh] w-full resize-none bg-transparent font-mono text-[12.5px] leading-relaxed outline-none"
                />
              ) : (
                <PlanAnnotationDocument
                  ref={document_}
                  content={editedContent ?? current.content}
                />
              )}
            </div>
          </div>

          {/* Why only when there are notes: an empty rail was the largest thing on screen for a
              short plan, and it competed with the document for attention while saying nothing. */}
          {sorted.length > 0 ? (
            <PlanAnnotationNoteList
              notes={sorted}
              previewText={showPreview ? previewFeedback(notes) : null}
              activeNoteId={activeNoteId}
              onTogglePreview={() => setShowPreview((shown) => !shown)}
              onFocusNote={setActiveNoteId}
              onRemoveNote={removeNote}
            />
          ) : null}
        </div>

        {composer ? (
          <PlanAnnotationComposer
            anchor={composer}
            onCancel={() => {
              setComposer(null)
              pendingRange.current = null
            }}
            labels={QUICK_LABELS}
            onSave={saveNote}
          />
        ) : null}

        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2.5">
          <p className="text-[11px] text-muted-foreground">
            {notes.length === 0
              ? 'Select any passage to comment on it'
              : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'} ready to send`}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => settle('dismissed')}>
              Close
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => settle(notes.length > 0 ? 'approved_with_notes' : 'approved')}
            >
              <Check className="size-4" />
              {notes.length > 0 ? 'Approve with notes' : 'Approve'}
            </Button>
            <Button size="sm" disabled={notes.length === 0} onClick={() => settle('annotated')}>
              <Send className="size-4" />
              Send feedback
            </Button>
          </div>
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
