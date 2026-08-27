// What's New modal: shown on the first launch after an app update, never on a
// fresh install. The version transition is resolved by comparing the version
// recorded on the previous run against the running version.

export type WhatsNewResolution =
  /** Fresh install (no recorded version) — record the version, show nothing. */
  | { kind: 'install' }
  /** Same version as last run — nothing to show. */
  | { kind: 'same' }
  /** Recorded version is NEWER than the running one (rollback) — record it, show nothing. */
  | { kind: 'rollback' }
  /** Recorded version is older — this launch follows an update. */
  | { kind: 'update' }

export type WhatsNewPayload = {
  version: string
  /** Release notes body in markdown, or null when they could not be fetched (offline). */
  notes: string | null
  /** Link to the full release page on GitHub. */
  notesUrl: string | null
}

export type WhatsNewGetResult = { status: 'none' } | { status: 'ready'; payload: WhatsNewPayload }

/**
 * Compares the version recorded on the previous run against the running one.
 * Unparseable stored values are treated as unknown provenance: record the
 * current version and show nothing rather than risk a wrong-modal flash.
 */
export function resolveWhatsNewTransition(
  storedVersion: string | null | undefined,
  currentVersion: string
): WhatsNewResolution {
  if (!storedVersion) {
    return { kind: 'install' }
  }
  if (storedVersion === currentVersion) {
    return { kind: 'same' }
  }
  const stored = parseVersionSegments(storedVersion)
  const current = parseVersionSegments(currentVersion)
  if (!stored || !current) {
    return { kind: 'install' }
  }
  // Why a loop: array `<` stringifies both sides, so 1.5.9 vs 1.5.10 compared
  // as "…,9" < "…,10" reads backwards. Compare segments numerically instead.
  const length = Math.max(stored.length, current.length)
  for (let index = 0; index < length; index += 1) {
    const a = stored[index] ?? 0
    const b = current[index] ?? 0
    if (a !== b) {
      return a < b ? { kind: 'update' } : { kind: 'rollback' }
    }
  }
  return { kind: 'same' }
}

function parseVersionSegments(version: string): number[] | null {
  const segments = version.split('.').map((segment) => Number.parseInt(segment, 10))
  if (segments.length === 0 || segments.some((segment) => !Number.isFinite(segment))) {
    return null
  }
  return segments
}
