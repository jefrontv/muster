// Reading width, and the switch into direct editing.
//
// Why width is a control rather than a constant: a plan with wide tables is unreadable at a prose
// measure, and prose is unreadable at a table's width. The reviewer knows which they are looking at.

import type React from 'react'

export type PlanViewMode = 'reading' | 'wide' | 'focus'

/** Measure applied to the document column for each mode. */
export const VIEW_MODE_WIDTH: Record<PlanViewMode, string> = {
  reading: 'max-w-[760px]',
  wide: 'max-w-none',
  // Focus narrows further and is paired with a dimmed chrome, for reading a dense plan closely.
  focus: 'max-w-[620px]'
}

const MODES: { mode: PlanViewMode; label: string }[] = [
  { mode: 'reading', label: 'Reading' },
  { mode: 'wide', label: 'Wide' },
  { mode: 'focus', label: 'Focus' }
]

export function PlanAnnotationViewModes({
  mode,
  editing,
  onModeChange,
  onToggleEdit
}: {
  mode: PlanViewMode
  editing: boolean
  onModeChange: (mode: PlanViewMode) => void
  onToggleEdit: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-0.5 text-[11px]">
      {MODES.map((entry) => (
        <button
          key={entry.mode}
          type="button"
          disabled={editing}
          onClick={() => onModeChange(entry.mode)}
          aria-pressed={mode === entry.mode}
          className={`rounded px-1.5 py-0.5 transition-colors disabled:opacity-40 ${
            mode === entry.mode && !editing
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/50'
          }`}
        >
          {entry.label}
        </button>
      ))}
      <span className="mx-1 h-3 w-px bg-border" />
      <button
        type="button"
        onClick={onToggleEdit}
        aria-pressed={editing}
        className={`rounded px-1.5 py-0.5 transition-colors ${
          editing ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'
        }`}
      >
        {editing ? 'Done' : 'Edit'}
      </button>
    </div>
  )
}
