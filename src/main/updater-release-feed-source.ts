// Muster fork: every feed URL and update entry point routes through this module so the app never
// accidentally pulls stablyai/orca binaries. GitHub Releases on jefrontv/muster is the production
// feed — electron-builder publishes latest-*.yml + installers there; electron-updater consumes them
// via the generic provider (not the native GitHub provider) so RC/prerelease probing stays under
// our control (see pinDefaultReleaseFeed in updater.ts).

/** Production switch. Off only when intentionally kill-switching updates. */
const AUTO_UPDATE_ENABLED = true

/** GitHub owner/repo that hosts release artifacts and the atom feed. */
export const RELEASE_GITHUB_OWNER = 'jefrontv'
export const RELEASE_GITHUB_REPO = 'muster'

const RELEASE_GITHUB_ORIGIN = `https://github.com/${RELEASE_GITHUB_OWNER}/${RELEASE_GITHUB_REPO}`

/**
 * Tests keep the full updater path green without hitting the network. Production always uses
 * AUTO_UPDATE_ENABLED above.
 */
function isTestRuntime(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
}

export function isAutoUpdateEnabled(): boolean {
  return AUTO_UPDATE_ENABLED || isTestRuntime()
}

/** electron-updater generic feed root for the latest channel (`latest-mac.yml`, etc.). */
export const RELEASE_LATEST_DOWNLOAD_URL = `${RELEASE_GITHUB_ORIGIN}/releases/latest/download`

/** Atom feed used to discover newer tags (stable + prerelease) without the GitHub REST API. */
export const RELEASE_ATOM_FEED_URL = `${RELEASE_GITHUB_ORIGIN}/releases.atom`

/** Per-tag download base: `${RELEASE_DOWNLOAD_BASE}/v1.2.3/latest-mac.yml`. */
export const RELEASE_DOWNLOAD_BASE = `${RELEASE_GITHUB_ORIGIN}/releases/download`

/** Mines `/releases/tag/<tag>` hrefs out of the atom feed. Must track RELEASE_ATOM_FEED_URL's host. */
export function createReleaseTagHrefPattern(): RegExp {
  // Why: GitHub's atom feed uses absolute https://github.com/.../releases/tag/<tag> links.
  return new RegExp(
    `href="${RELEASE_GITHUB_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/releases/tag/([^"]+)"`,
    'g'
  )
}
