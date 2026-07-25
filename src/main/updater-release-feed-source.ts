// Muster fork: the auto-updater must never reach the upstream Orca release feed, or it will
// download stablyai/orca builds over this app. Every feed URL and every update entry point routes
// through this module so there is one place to audit and one place to re-enable.
//
// Re-enabling requires a real Muster release feed first: flip AUTO_UPDATE_ENABLED and repoint the
// URLs below. The `.invalid` TLD (RFC 2606) can never resolve, so an accidental re-enable fails
// closed instead of installing someone else's binaries.

/** Production switch. False until a Muster release feed exists. */
const AUTO_UPDATE_ENABLED = false

/**
 * Upstream's updater test suite is thorough and worth keeping green — the code path has to work
 * the day a Muster feed is published. Tests therefore opt back in; nothing else can.
 */
function isTestRuntime(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
}

export function isAutoUpdateEnabled(): boolean {
  return AUTO_UPDATE_ENABLED || isTestRuntime()
}

export const RELEASE_LATEST_DOWNLOAD_URL =
  'https://releases.muster.invalid/releases/latest/download'

export const RELEASE_ATOM_FEED_URL = 'https://releases.muster.invalid/releases.atom'

export const RELEASE_DOWNLOAD_BASE = 'https://releases.muster.invalid/releases/download'

/** Mines `/releases/tag/<tag>` hrefs out of the atom feed. Must track RELEASE_ATOM_FEED_URL's host. */
export function createReleaseTagHrefPattern(): RegExp {
  return /href="https:\/\/releases\.muster\.invalid\/releases\/tag\/([^"]+)"/g
}
