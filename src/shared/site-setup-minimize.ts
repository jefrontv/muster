// A site setup, clone, or import that has been pushed to the status bar.
//
// The flow itself keeps running in its own dialog, which stays mounted and hidden — main already
// owns the clone and the import, so minimizing costs nothing but visibility. What lives here is the
// little the status-bar chip needs to render, reported by the dialog that owns the real state.

/**
 * What the chip is telling the user.
 *
 * `running` and `waiting` are the distinction that matters: a spinner says "leave it alone", a
 * pulse says "it needs you". The dialogs already track both — a clone in flight or a site run with
 * status `running` against a stage that is `active` and awaiting an answer — so nothing here is
 * newly invented.
 */
export type SiteSetupFlowPhase = 'running' | 'waiting' | 'error'

export type MinimizedSiteSetupFlow = {
  /** Identifies the flow so a second one cannot overwrite the first's chip. */
  id: string
  /** The site this is about, e.g. "acme" — what the user recognises it by. */
  label: string
  /** The step in progress or awaiting them, e.g. "Cloning" or "Choose a stack". */
  stage: string
  phase: SiteSetupFlowPhase
  /** 0-100 while a clone or import reports it; null for a stage with no measure. */
  percent: number | null
}

/** How the chip reads when several flows are minimized at once. */
export function describeMinimizedFlow(flow: MinimizedSiteSetupFlow): string {
  const percent = flow.percent === null ? '' : ` ${Math.round(flow.percent)}%`
  return `${flow.label} — ${flow.stage}${percent}`
}

/**
 * The flow the chip should show when several are minimized.
 *
 * Anything needing the user outranks anything running: a stalled question is the only one of the
 * two they can act on, and it is the one that would otherwise sit unnoticed behind a spinner.
 */
export function primaryMinimizedFlow(
  flows: readonly MinimizedSiteSetupFlow[]
): MinimizedSiteSetupFlow | null {
  if (flows.length === 0) {
    return null
  }
  const rank: Record<SiteSetupFlowPhase, number> = { error: 0, waiting: 1, running: 2 }
  return [...flows].sort((a, b) => rank[a.phase] - rank[b.phase])[0] ?? null
}

export type MinimizedSiteSetupFlows = Record<string, MinimizedSiteSetupFlow>

/**
 * Applies a progress report, or returns the same object when there is nothing to change.
 *
 * Two refusals, both load-bearing. An unknown id is ignored because the dialog reports whether or
 * not it is minimized, and a report that re-created a restored flow would leave a chip the user
 * cannot get rid of. An unchanged report returns the identical object so a long clone re-rendering
 * every frame does not re-render the status bar with it.
 */
export function applyMinimizedFlowPatch(
  flows: MinimizedSiteSetupFlows,
  id: string,
  patch: Partial<MinimizedSiteSetupFlow>
): MinimizedSiteSetupFlows {
  const current = flows[id]
  if (!current) {
    return flows
  }
  const next = { ...current, ...patch }
  if (
    next.label === current.label &&
    next.stage === current.stage &&
    next.phase === current.phase &&
    next.percent === current.percent
  ) {
    return flows
  }
  return { ...flows, [id]: next }
}

/** Drops a flow. Returns the same object when it was not there, so state need not change. */
export function removeMinimizedFlow(
  flows: MinimizedSiteSetupFlows,
  id: string
): MinimizedSiteSetupFlows {
  if (!(id in flows)) {
    return flows
  }
  const next = { ...flows }
  delete next[id]
  return next
}
