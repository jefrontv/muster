// Fetches the release notes body for a version from the same GitHub releases
// the updater consumes. Fetch lives behind an injected loader so tests never
// touch the network, and the result is memoized per version: the modal asks
// once per update.

import { RELEASE_GITHUB_OWNER, RELEASE_GITHUB_REPO } from './updater-release-feed-source'
import type { WhatsNewPayload } from '../shared/whats-new'

const NOTES_FETCH_TIMEOUT_MS = 5000

export type ReleaseNotesLoader = (version: string) => Promise<WhatsNewPayload | null>

export function createGitHubReleaseNotesLoader(
  fetchImpl: typeof fetch = fetch
): ReleaseNotesLoader {
  const cache = new Map<string, WhatsNewPayload | null>()
  return async (version: string): Promise<WhatsNewPayload | null> => {
    const cached = cache.get(version)
    if (cached !== undefined) {
      return cached
    }
    const payload = await fetchReleaseNotes(fetchImpl, version)
    cache.set(version, payload)
    return payload
  }
}

async function fetchReleaseNotes(
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
    const body = (await response.json()) as {
      body?: unknown
      html_url?: unknown
    }
    const notes = typeof body.body === 'string' && body.body.trim().length > 0 ? body.body : null
    const notesUrl = typeof body.html_url === 'string' ? body.html_url : null
    if (notes === null && notesUrl === null) {
      return null
    }
    return { version, notes, notesUrl }
  } catch {
    // Offline / rate-limited / repo unreachable: the modal still shows with a
    // link out rather than blocking on the network.
    return null
  }
}
