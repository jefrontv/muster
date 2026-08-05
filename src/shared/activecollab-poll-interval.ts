// Polling cadence for ActiveCollab, which has no push channel.
//
// The bounds exist because the value reaches a live API: too low and every Muster window turns
// into a rate-limit incident on a shared workspace; too high and "Tasks" is stale enough to be
// misleading. Clamping (rather than rejecting) keeps a hand-edited settings file bootable.
//
// Shared, not main-only: the Settings pane renders the same bounds it enforces.

export const DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS = 60_000
export const MIN_ACTIVECOLLAB_POLL_INTERVAL_MS = 15_000
export const MAX_ACTIVECOLLAB_POLL_INTERVAL_MS = 900_000

export function clampActiveCollabPollIntervalMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_ACTIVECOLLAB_POLL_INTERVAL_MS
  }
  return Math.min(
    MAX_ACTIVECOLLAB_POLL_INTERVAL_MS,
    Math.max(MIN_ACTIVECOLLAB_POLL_INTERVAL_MS, Math.round(value))
  )
}
