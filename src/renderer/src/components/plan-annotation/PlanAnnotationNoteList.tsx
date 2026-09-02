// The notes rail: what you have already said, and what the agent will receive.
//
// The rail is a summary, not the place you write — comments are composed inline at the passage.
// Its job is letting you re-read, re-open and remove, and preview the exact markdown before it is
// sent to something that cannot ask a follow-up question.

import type React from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PlanAnnotationKind } from '../../../../shared/plan-annotation-types'
import type { DraftNote } from './plan-annotation-notes'

/**
 * How each kind reads in the rail.
 *
 * Why every kind gets a badge: a Remove or a Looks good usually carries no prose, so without one
 * the card is blank and the reviewer cannot tell what they marked — or that they marked anything.
 */
const KIND_BADGE: Record<PlanAnnotationKind, { label: string; className: string }> = {
  comment: { label: 'Comment', className: 'bg-muted text-muted-foreground' },
  delete: {
    label: 'Remove',
    className:
      'bg-[color-mix(in_srgb,var(--plan-annotation-remove)_28%,transparent)] text-foreground'
  },
  looks_good: {
    label: 'Looks good',
    className: 'bg-[color-mix(in_srgb,var(--plan-annotation-good)_28%,transparent)] text-foreground'
  },
  label: {
    label: 'Label',
    className: 'bg-[color-mix(in_srgb,var(--plan-annotation-mark)_28%,transparent)] text-foreground'
  },
  global: { label: 'Whole plan', className: 'bg-muted text-muted-foreground' }
}

export function PlanAnnotationNoteList({
  notes,
  previewText,
  activeNoteId,
  onTogglePreview,
  onFocusNote,
  onEditNote,
  onRemoveNote
}: {
  notes: readonly DraftNote[]
  /** Non-null when the reviewer is inspecting the outgoing markdown instead of the note cards. */
  previewText: string | null
  activeNoteId: string | null
  onTogglePreview: () => void
  onFocusNote: (id: string | null) => void
  onEditNote: (id: string) => void
  onRemoveNote: (id: string) => void
}): React.JSX.Element {
  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-border/60">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="text-xs font-medium">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </span>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onTogglePreview}>
          {previewText === null ? 'Preview' : 'Notes'}
        </Button>
      </div>

      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-3">
        {previewText === null ? (
          <ul className="space-y-2">
            {notes.map((note) => {
              const badge = KIND_BADGE[note.kind]
              return (
                <li key={note.id}>
                  <button
                    type="button"
                    onMouseEnter={() => onFocusNote(note.id)}
                    onMouseLeave={() => onFocusNote(null)}
                    // Why the card opens the composer: editing a note should use the box that
                    // created it, at the passage it belongs to, not a second editing surface.
                    onClick={() => onEditNote(note.id)}
                    className={`w-full rounded-md border p-2 text-left text-xs transition-colors ${
                      activeNoteId === note.id
                        ? 'border-ring bg-accent/40'
                        : 'border-border/70 hover:bg-accent/20'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}
                      >
                        {note.kind === 'label' ? (note.label ?? badge.label) : badge.label}
                      </span>
                      {note.kind !== 'global' ? (
                        <span className="text-[10px] text-muted-foreground">
                          Line {note.startLine}
                        </span>
                      ) : null}
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Remove note"
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation()
                          onRemoveNote(note.id)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.stopPropagation()
                            onRemoveNote(note.id)
                          }
                        }}
                      >
                        <X className="size-3" />
                      </span>
                    </div>
                    {note.quote ? (
                      <p
                        className={`mb-1 line-clamp-2 border-l-2 pl-2 text-muted-foreground ${
                          note.kind === 'delete'
                            ? 'border-[var(--plan-annotation-remove)] line-through'
                            : note.kind === 'looks_good'
                              ? 'border-[var(--plan-annotation-good)]'
                              : 'border-border'
                        }`}
                      >
                        {note.quote}
                      </p>
                    ) : null}
                    {note.body ? <p className="whitespace-pre-wrap">{note.body}</p> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <pre className="text-[11px] whitespace-pre-wrap text-muted-foreground">{previewText}</pre>
        )}
      </div>
    </aside>
  )
}
