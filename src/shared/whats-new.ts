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

export type ReleaseNotes = {
  version: string
  /** Release notes body in markdown, or null when they could not be fetched (offline). */
  notes: string | null
  /** Link to the full release page on GitHub. */
  notesUrl: string | null
}

export type WhatsNewPayload = ReleaseNotes & {
  /**
   * Releases the user skipped over, newest first, excluding the one they are now on.
   *
   * Why: someone updating from 1.6.0 to 1.9.0 never saw 1.7 or 1.8, and showing only the newest
   * release's notes silently buries everything that landed in between.
   */
  missed: ReleaseNotes[]
  /** Skipped releases beyond the display cap, so the modal can say so instead of lying. */
  missedOverflow: number
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
  // Why split on '-' first: `parseInt('0-rc', 10)` is 0, not NaN, so a prerelease tag used to parse
  // as an extra segment and sort AFTER the release it precedes. Compare release cores only, and
  // reject anything that is not purely digits rather than silently reading it as a number.
  const core = version.split('-')[0] ?? ''
  const parts = core.split('.')
  if (parts.length === 0 || !parts.every((part) => /^\d+$/.test(part))) {
    return null
  }
  return parts.map((part) => Number.parseInt(part, 10))
}

/**
 * Numeric segment-wise comparison. Null for anything unparseable, so a caller can skip a tag
 * rather than guess where a prerelease like `1.9.0-rc.1` belongs.
 */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersionSegments(a)
  const right = parseVersionSegments(b)
  if (!left || !right) {
    return null
  }
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const x = left[index] ?? 0
    const y = right[index] ?? 0
    if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}
