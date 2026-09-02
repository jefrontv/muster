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
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { PlanAnnotationFooter, PlanAnnotationHeader } from './PlanAnnotationChrome'
import type {
  PlanAnnotationDecision,
  PlanAnnotationKind,
  PlanAnnotationResult
} from '../../../../shared/plan-annotation-types'
import { PlanAnnotationComposer, type ComposerAnchor } from './PlanAnnotationComposer'
import { PlanAnnotationDocument } from './PlanAnnotationDocument'
import { usePlanReviewQueue } from './use-plan-review-queue'
import { usePlanAnnotationRanges } from './use-plan-annotation-ranges'
import { PlanAnnotationGlobalNote } from './PlanAnnotationGlobalNote'
import { VIEW_MODE_WIDTH, type PlanViewMode } from './PlanAnnotationViewModes'
import { unifiedPlanDiff } from './plan-annotation-diff'
import { PlanAnnotationNoteList } from './PlanAnnotationNoteList'
import { clearDraft, draftKey, loadDraft, saveDraft } from './plan-annotation-drafts'
import { clearPlanHighlights } from './plan-annotation-highlights'
import {
  createNote,
  previewFeedback,
  readSelectionAnchor,
  sortNotes,
  toAnnotations,
  type DraftNote
} from './plan-annotation-notes'

export function PlanAnnotationDialog(): React.JSX.Element | null {
  const { current, waiting, popCurrent } = usePlanReviewQueue()
  const [notes, setNotes] = useState<DraftNote[]>([])
  const [composer, setComposer] = useState<ComposerAnchor | null>(null)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [globalOpen, setGlobalOpen] = useState(false)
  const [viewMode, setViewMode] = useState<PlanViewMode>('reading')
  const [editing, setEditing] = useState(false)
  const [editedContent, setEditedContent] = useState<string | null>(null)

  const scroller = useRef<HTMLDivElement | null>(null)
  const document_ = useRef<HTMLDivElement | null>(null)
  const { rangesById, noteAtPoint } = usePlanAnnotationRanges({
    notes,
    activeNoteId,
    documentRef: document_,
    content: current?.content
  })
  const pendingRange = useRef<Range | null>(null)
  // Why refs: openComposer needs editNote and placeComposer, both of which are declared after it
  // and depend on state it also touches. Refs break the cycle without reordering the whole file.
  const editNoteRef = useRef<((id: string) => void) | null>(null)
  const placeComposerRef = useRef<((range: Range, quote: string) => void) | null>(null)

  const key = current ? draftKey(current) : null

  useEffect(() => {
    rangesById.current.clear()
    setNotes(key ? loadDraft(key) : [])
    setComposer(null)
    setActiveNoteId(null)
    setEditingNoteId(null)
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

  const openComposer = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const selection = window.getSelection()
      // A click with no selection, landing on an existing highlight, means "open that note" rather
      // than "start a new one" — the same box serves both.
      if (!selection || selection.isCollapsed) {
        const hit = noteAtPoint(event.clientX, event.clientY)
        if (hit) {
          editNoteRef.current?.(hit)
        }
        return
      }
      const parsed = readSelectionAnchor(selection)
      const pane = scroller.current
      const shell = pane?.closest('[data-slot="dialog-content"]') ?? null
      if (!parsed || !pane || !shell) {
        return
      }
      const range = selection.getRangeAt(0)
      pendingRange.current = range.cloneRange()
      setEditingNoteId(null)
      placeComposerRef.current?.(pendingRange.current, parsed.quote)
    },
    [noteAtPoint]
  )

  /** Places the composer over a range, whether that came from a selection or a saved note. */
  const placeComposer = useCallback((range: Range, quote: string): void => {
    const pane = scroller.current
    const shell = pane?.closest('[data-slot="dialog-content"]') ?? null
    if (!pane || !shell) {
      return
    }
    const rect = range.getBoundingClientRect()
    const pageRect = pane.getBoundingClientRect()
    const shellRect = shell.getBoundingClientRect()
    setComposer({
      quote,
      rect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right
      },
      bounds: {
        top: pageRect.top,
        bottom: pageRect.bottom,
        left: pageRect.left,
        right: pageRect.right
      },
      origin: { top: shellRect.top, left: shellRect.left }
    })
  }, [])

  /**
   * Reopens a saved note in the same box that created it.
   *
   * Scrolls first so the passage is on screen: placing the composer against an off-screen rect
   * would pin it to the edge of the pane, nowhere near the text it belongs to.
   */
  const editNote = useCallback(
    (id: string) => {
      const note = notes.find((entry) => entry.id === id)
      const range = rangesById.current.get(id)
      if (!note || !range) {
        return
      }
      pendingRange.current = range
      setEditingNoteId(id)
      setActiveNoteId(id)
      // Instant, not smooth: the composer is positioned from the passage's rect, so the rect has
      // to be final before it is read. Animating meant guessing when the scroll had settled — and
      // the rAF that guess hung off never fires at all while the window is hidden.
      const target =
        range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement
      target?.scrollIntoView({ block: 'center' })
      placeComposer(range, note.quote)
    },
    [notes, placeComposer]
  )

  editNoteRef.current = editNote
  placeComposerRef.current = placeComposer

  const saveNote = useCallback(
    (kind: PlanAnnotationKind, body: string, attachments: string[]) => {
      if (editingNoteId) {
        applyNotes(
          notes.map((note) =>
            note.id === editingNoteId ? { ...note, kind, body, attachments } : note
          )
        )
      } else {
        const resolved = readSelectionAnchorFromRange(pendingRange.current)
        if (!resolved) {
          return
        }
        const note = createNote({ kind, body, anchor: resolved, attachments })
        if (pendingRange.current) {
          rangesById.current.set(note.id, pendingRange.current)
        }
        applyNotes([...notes, note])
      }
      setComposer(null)
      setEditingNoteId(null)
      pendingRange.current = null
      window.getSelection()?.removeAllRanges()
    },
    [applyNotes, editingNoteId, notes]
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
      popCurrent()
    },
    [current, editedContent, key, notes]
  )

  const sorted = useMemo(() => sortNotes(notes), [notes])
  const editingNote = editingNoteId ? (notes.find((n) => n.id === editingNoteId) ?? null) : null

  if (!current) {
    return null
  }

  return (
    <Dialog open onOpenChange={(next) => !next && settle('dismissed')}>
      {/* Why showCloseButton={false}: the built-in × is absolutely positioned at top-right and
          lands on top of the header actions. Close lives in the footer with the other decisions. */}
      <DialogContent
        showCloseButton={false}
        // Why intercept Escape: Radix would dismiss the whole review, which discards every note the
        // reviewer wrote AND answers the waiting agent with 'no feedback'. Escape closes the thing
        // on top; ending the review is deliberate, through the footer.
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          if (composer) {
            setComposer(null)
            setEditingNoteId(null)
            pendingRange.current = null
            return
          }
          if (globalOpen) {
            setGlobalOpen(false)
          }
        }}
        className="flex h-[min(88vh,900px)] w-[min(1180px,calc(100vw-4rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1180px]"
      >
        <PlanAnnotationHeader
          title={current.title}
          round={current.round}
          waiting={waiting}
          viewMode={viewMode}
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
          onToggleGlobal={() => setGlobalOpen((open) => !open)}
          onCopyPlan={() => void navigator.clipboard.writeText(editedContent ?? current.content)}
        />

        {globalOpen ? (
          <PlanAnnotationGlobalNote onCancel={() => setGlobalOpen(false)} onSave={addGlobal} />
        ) : null}

        <div className="flex min-h-0 flex-1">
          <div
            ref={scroller}
            className="plan-annotation-canvas scrollbar-sleek min-w-0 flex-1 overflow-y-auto"
            // Why gated on editing: a selection inside the textarea is a text cursor, not an
            // annotation, and popping a composer over the caret makes editing impossible.
            onMouseUp={
              editing
                ? undefined
                : (event) =>
                    openComposer({
                      clientX: event.clientX,
                      clientY: event.clientY
                    })
            }
          >
            <div
              className={`plan-annotation-sheet mx-auto my-6 w-full px-10 py-9 ${VIEW_MODE_WIDTH[viewMode]}`}
            >
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
              onEditNote={editNote}
              onRemoveNote={removeNote}
            />
          ) : null}
        </div>

        {composer ? (
          <PlanAnnotationComposer
            anchor={composer}
            onCancel={() => {
              setComposer(null)
              setEditingNoteId(null)
              pendingRange.current = null
            }}
            existing={
              editingNote
                ? {
                    kind: editingNote.kind,
                    body: editingNote.body,
                    attachments: editingNote.attachments
                  }
                : null
            }
            onDelete={() => {
              if (editingNoteId) {
                removeNote(editingNoteId)
              }
              setComposer(null)
              setEditingNoteId(null)
            }}
            onSave={saveNote}
          />
        ) : null}

        <PlanAnnotationFooter
          noteCount={notes.length}
          onDismiss={() => settle('dismissed')}
          onApprove={() => settle(notes.length > 0 ? 'approved_with_notes' : 'approved')}
          onSend={() => settle('annotated')}
        />
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
