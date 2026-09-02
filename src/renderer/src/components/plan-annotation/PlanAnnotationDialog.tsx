// Human review of an agent's plan, opened by the muster-sites `annotate_plan` tool.
//
// Self-mounted and IPC-driven, like ChatConnectorConfirmDialog: the generic activeModal switchboard
// has no producers outside renderer-originated interaction, and an agent-initiated dialog needs to
// appear without one. Reviews queue rather than collide, because two agents (or one, since
// annotate_plan runs off the server's dispatch chain) can ask at the same time and a dropped
// request is a review the user did for nothing.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { Check, MessageSquarePlus, Send, ThumbsUp, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type {
  PlanAnnotationDecision,
  PlanAnnotationRequest,
  PlanAnnotationResult
} from '../../../../shared/plan-annotation-types'
import { PlanAnnotationDocument } from './PlanAnnotationDocument'
import { clearDraft, draftKey, loadDraft, saveDraft } from './plan-annotation-drafts'
import {
  createNote,
  previewFeedback,
  readSelectionAnchor,
  sortNotes,
  toAnnotations,
  type DraftNote,
  type SelectionAnchor
} from './plan-annotation-notes'

export function PlanAnnotationDialog(): React.JSX.Element | null {
  const [queue, setQueue] = useState<PlanAnnotationRequest[]>([])
  const [notes, setNotes] = useState<DraftNote[]>([])
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null)
  const [body, setBody] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  useEffect(
    () => window.api.planAnnotation.onRequest((request) => setQueue((q) => [...q, request])),
    []
  )

  // Why: a review can be queued before this window existed (or before a reload finished), and
  // without this the agent waits out the whole timeout for a modal nobody ever saw.
  useEffect(() => {
    void window.api.planAnnotation
      .listPending()
      .then((pending) =>
        setQueue((q) => [
          ...q,
          ...pending.filter((p) => !q.some((e) => e.requestId === p.requestId))
        ])
      )
      .catch(() => undefined)
  }, [])

  const current = queue[0] ?? null
  const key = current ? draftKey(current) : null

  useEffect(() => {
    setNotes(key ? loadDraft(key) : [])
    setAnchor(null)
    setBody('')
    setShowPreview(false)
  }, [key])

  useEffect(() => {
    if (key) {
      saveDraft(key, notes)
    }
  }, [key, notes])

  const captureSelection = useCallback(() => {
    const next = readSelectionAnchor(window.getSelection())
    if (next) {
      setAnchor(next)
    }
  }, [])

  const addNote = useCallback(
    (kind: DraftNote['kind']) => {
      const text = body.trim()
      // A bare "looks good" or "delete" on a selection is meaningful with no prose; a comment is not.
      if (kind === 'comment' && text.length === 0) {
        return
      }
      setNotes((existing) => [...existing, createNote({ kind, body: text, anchor })])
      setBody('')
      setAnchor(null)
      window.getSelection()?.removeAllRanges()
    },
    [anchor, body]
  )

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
      setQueue((q) => q.slice(1))
    },
    [current, key, notes]
  )

  const sorted = useMemo(() => sortNotes(notes), [notes])

  if (!current) {
    return null
  }

  const waiting = queue.length - 1

  return (
    <Dialog open onOpenChange={(next) => !next && settle('dismissed')}>
      <DialogContent className="flex h-[85vh] max-w-6xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border/70 px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            {current.title}
            {current.round > 1 ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                round {current.round}
              </span>
            ) : null}
            {waiting > 0 ? (
              <span className="text-[11px] font-normal text-muted-foreground">
                {waiting} more waiting
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <div
            className="min-w-0 flex-1 overflow-y-auto px-4 py-3"
            onMouseUp={captureSelection}
            onKeyUp={captureSelection}
          >
            <PlanAnnotationDocument content={current.content} />
          </div>

          <aside className="flex w-[340px] shrink-0 flex-col border-l border-border/70">
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {showPreview ? (
                <pre className="text-[11px] whitespace-pre-wrap text-muted-foreground">
                  {previewFeedback(notes)}
                </pre>
              ) : sorted.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Select text in the plan to comment on it, or add a general note below.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sorted.map((note) => (
                    <li key={note.id} className="rounded-md border border-border/70 p-2 text-xs">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {note.kind === 'global' ? 'General' : `Line ${note.startLine}`}
                        </span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setNotes((e) => e.filter((n) => n.id !== note.id))}
                          aria-label="Remove note"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                      {note.quote ? (
                        <p className="mb-1 border-l-2 border-border pl-2 text-muted-foreground">
                          {note.quote.slice(0, 160)}
                        </p>
                      ) : null}
                      <p>{note.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2 border-t border-border/70 p-3">
              {anchor ? (
                <p className="truncate text-[11px] text-muted-foreground">
                  On line {anchor.startLine}: “{anchor.quote.slice(0, 60)}”
                </p>
              ) : null}
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={anchor ? 'Comment on the selection…' : 'General note about the plan…'}
                className="min-h-[64px] w-full resize-y rounded-md border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" onClick={() => addNote('comment')}>
                  <MessageSquarePlus className="size-3.5" />
                  Comment
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!anchor}
                  onClick={() => addNote('delete')}
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!anchor}
                  onClick={() => addNote('looks_good')}
                >
                  <ThumbsUp className="size-3.5" />
                  Looks good
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowPreview((shown) => !shown)}>
                  {showPreview ? 'Notes' : 'Preview'}
                </Button>
              </div>
            </div>
          </aside>
        </div>

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
