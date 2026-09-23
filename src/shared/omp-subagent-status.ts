// omp panes: the Muster extension sends the whole sub-agent roster on every post, so the listener
// keeps only the latest list and the lead's own state (docs/specs/omp-subagents.md).

export type OmpLeadState = 'working' | 'blocked' | 'done'

export type OmpSubagentEntry = Record<string, unknown> & { id: string }

/** An array (possibly empty) from a current extension; undefined from an older one, which leaves
 *  the stored roster alone. */
export function readOmpSubagentRoster(value: unknown): OmpSubagentEntry[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.filter(
    (entry): entry is OmpSubagentEntry =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof (entry as { id?: unknown }).id === 'string'
  )
}

/** A lead that finished its turn still reads as working while any sub-agent works. */
export function ompEffectiveState(
  lead: OmpLeadState,
  roster: readonly OmpSubagentEntry[] | undefined
): OmpLeadState {
  if (lead === 'done' && roster?.some((entry) => entry.state === 'working')) {
    return 'working'
  }
  return lead
}
