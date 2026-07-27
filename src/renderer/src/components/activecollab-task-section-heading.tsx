import React from 'react'

type ActiveCollabTaskSectionHeadingProps = {
  label: string
  /** Omitted or zero renders no pill; a bare "0" beside a heading reads as an error. */
  count?: number | null
}

/** One heading treatment for every band in the scrolling half of the task pane. */
export function ActiveCollabTaskSectionHeading({
  label,
  count = null
}: ActiveCollabTaskSectionHeadingProps): React.JSX.Element {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
      <span>{label}</span>
      {count !== null && count > 0 ? (
        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tabular-nums">
          {count}
        </span>
      ) : null}
    </h3>
  )
}
