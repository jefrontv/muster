// The notes rail: what you have already said, and what the agent will receive.
//
// The rail is a summary, not the place you write — comments are composed inline at the passage.
// Its job is letting you re-read, re-focus and remove, and preview the exact markdown before it is
// sent to something that cannot ask a follow-up question.

import type React from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DraftNote } from './plan-annotation-notes'

export function PlanAnnotationNoteList({
  notes,
  previewText,
  activeNoteId,
  onTogglePreview,
  onFocusNote,
  onRemoveNote
}: {
  notes: readonly DraftNote[]
  /** Non-null when the reviewer is inspecting the outgoing markdown instead of the note cards. */
  previewText: string | null
  activeNoteId: string | null
  onTogglePreview: () => void
  onFocusNote: (id: string | null) => void
  onRemoveNote: (id: string) => void
}): React.JSX.Element {
  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-border/70">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <span className="text-xs font-medium">
          {notes.length === 0
            ? 'No notes yet'
            : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
        </span>
        <Button size="sm" variant="ghost" onClick={onTogglePreview} disabled={notes.length === 0}>
          {previewText === null ? 'Preview' : 'Notes'}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {previewText !== null ? (
          <pre className="text-[11px] whitespace-pre-wrap text-muted-foreground">{previewText}</pre>
        ) : notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Select any passage in the plan to comment on it.
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onMouseEnter={() => onFocusNote(note.id)}
                  onMouseLeave={() => onFocusNote(null)}
                  onClick={() => onFocusNote(note.id)}
                  className={`w-full rounded-md border p-2 text-left text-xs transition-colors ${
                    activeNoteId === note.id
                      ? 'border-ring bg-accent/40'
                      : 'border-border/70 hover:bg-accent/20'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {note.kind === 'global' ? 'Whole plan' : `Line ${note.startLine}`}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Remove note"
                      className="text-muted-foreground hover:text-foreground"
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
                    <p className="mb-1 line-clamp-2 border-l-2 border-border pl-2 text-muted-foreground">
                      {note.quote}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap">{note.body}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
