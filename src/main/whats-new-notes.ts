// Fetches release notes for the version the user just landed on, plus any releases they skipped
// over. Fetch lives behind an injected loader so tests never touch the network, and the result is
// memoized per transition: the modal asks once per update.
//
// Why the releases list rather than one tag lookup per version: a user several versions behind
// would otherwise cost one request each, against an API that rate-limits unauthenticated callers
// hard. One page covers every realistic gap, and the per-tag fetch stays as the fallback.

import { RELEASE_GITHUB_OWNER, RELEASE_GITHUB_REPO } from './updater-release-feed-source'
import { compareVersions, type ReleaseNotes, type WhatsNewPayload } from '../shared/whats-new'

const NOTES_FETCH_TIMEOUT_MS = 5000

/**
 * How many skipped releases the modal will show.
 *
 * Why a cap: someone returning after months should get the recent history, not forty releases of
 * scroll. Anything beyond this is counted and pointed at the releases page instead.
 */
const MAX_MISSED_RELEASES = 8

export type ReleaseNotesLoader = (
  version: string,
  /** The version the user was on before this launch. Null when it is unknown. */
  sinceVersion: string | null
) => Promise<WhatsNewPayload | null>

export function createGitHubReleaseNotesLoader(
  fetchImpl: typeof fetch = fetch
): ReleaseNotesLoader {
  const cache = new Map<string, WhatsNewPayload | null>()
  return async (version: string, sinceVersion: string | null): Promise<WhatsNewPayload | null> => {
    const key = `${version}<-${sinceVersion ?? ''}`
    const cached = cache.get(key)
    if (cached !== undefined) {
      return cached
    }
    const payload =
      (await fetchReleaseRange(fetchImpl, version, sinceVersion)) ??
      (await fetchSingleRelease(fetchImpl, version))
    cache.set(key, payload)
    return payload
  }
}

function readRelease(entry: unknown): (ReleaseNotes & { skip: boolean }) | null {
  if (typeof entry !== 'object' || entry === null) {
    return null
  }
  const row = entry as {
    tag_name?: unknown
    body?: unknown
    html_url?: unknown
    draft?: unknown
    prerelease?: unknown
  }
  if (typeof row.tag_name !== 'string') {
    return null
  }
  // Tags are `v1.9.0`; the payload speaks plain versions everywhere else.
  const version = row.tag_name.replace(/^v/, '')
  return {
    version,
    notes: typeof row.body === 'string' && row.body.trim().length > 0 ? row.body : null,
    notesUrl: typeof row.html_url === 'string' ? row.html_url : null,
    // GitHub flags both itself, which beats guessing from the tag text.
    skip: row.draft === true || row.prerelease === true
  }
}

async function fetchReleaseRange(
  fetchImpl: typeof fetch,
  version: string,
  sinceVersion: string | null
): Promise<WhatsNewPayload | null> {
  const url = `https://api.github.com/repos/${RELEASE_GITHUB_OWNER}/${RELEASE_GITHUB_REPO}/releases?per_page=100`
  let rows: unknown
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(NOTES_FETCH_TIMEOUT_MS)
    })
    if (!response.ok) {
      return null
    }
    rows = await response.json()
  } catch {
    // Offline / rate-limited: the caller falls back to the single-tag fetch, then to a bare modal.
    return null
  }
  if (!Array.isArray(rows)) {
    return null
  }

  const releases = rows
    .map(readRelease)
    .filter((release): release is ReleaseNotes & { skip: boolean } => release !== null)
    .filter((release) => !release.skip)

  const current = releases.find((release) => release.version === version)
  if (!current) {
    // The running build has no published release yet (a local or unreleased version).
    return null
  }

  // Strictly between: the version they were on was already seen, and the current one leads.
  const missedAll =
    sinceVersion === null
      ? []
      : releases
          .filter((release) => {
            const afterSince = compareVersions(release.version, sinceVersion)
            const beforeCurrent = compareVersions(release.version, version)
            return (
              afterSince !== null && afterSince > 0 && beforeCurrent !== null && beforeCurrent < 0
            )
          })
          .sort((a, b) => compareVersions(b.version, a.version) ?? 0)

  return {
    version: current.version,
    notes: current.notes,
    notesUrl: current.notesUrl,
    missed: missedAll.slice(0, MAX_MISSED_RELEASES).map(({ version: v, notes, notesUrl }) => ({
      version: v,
      notes,
      notesUrl
    })),
    missedOverflow: Math.max(0, missedAll.length - MAX_MISSED_RELEASES)
  }
}

async function fetchSingleRelease(
  fetchImpl: typeof fetch,
  version: string
): Promise<WhatsNewPayload | null> {
  const tag = `v${version}`
  const url = `https://api.github.com/repos/${RELEASE_GITHUB_OWNER}/${RELEASE_GITHUB_REPO}/releases/tags/${tag}`
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(NOTES_FETCH_TIMEOUT_MS)
    })
    if (!response.ok) {
      return null
    }
    const body = (await response.json()) as { body?: unknown; html_url?: unknown }
    const notes = typeof body.body === 'string' && body.body.trim().length > 0 ? body.body : null
    const notesUrl = typeof body.html_url === 'string' ? body.html_url : null
    if (notes === null && notesUrl === null) {
      return null
    }
    return { version, notes, notesUrl, missed: [], missedOverflow: 0 }
  } catch {
    // Offline / rate-limited / repo unreachable: the modal still shows with a
    // link out rather than blocking on the network.
    return null
  }
}
