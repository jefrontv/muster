import React from 'react'

type ActiveCollabTaskSectionHeadingProps = {
  label: string
  /** Omitted or zero renders no pill; a bare "0" beside a heading reads as an error. */
  count?: number | null
  /** Progress in the pill's place, e.g. `2/5`. A section has one or the other, never both. */
  ratio?: string | null
}

/** One heading treatment for every band in the scrolling half of the task pane. */
export function ActiveCollabTaskSectionHeading({
  label,
  count = null,
  ratio = null
}: ActiveCollabTaskSectionHeadingProps): React.JSX.Element {
  // One pill, whichever the section supplies: a count and a ratio would read as two numbers about
  // the same thing.
  const pill = ratio ?? (count !== null && count > 0 ? String(count) : null)
  return (
    <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
      <span>{label}</span>
      {pill === null ? null : (
        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tabular-nums">
          {pill}
        </span>
      )}
    </h3>
  )
}
