// Adding a site by picking a repository from a git host you have already connected — the flow
// ocsites had, where "new site" started from the remote rather than from a folder you had to clone
// yourself first.
//
// Providers differ in how they authenticate (Bitbucket holds an API token in the keychain; GitHub
// rides the `gh` CLI's own login), so the UI must never assume a provider is usable. Every provider
// reports whether it is configured and, when it is not, a reason the user can act on. An
// unconfigured provider is a normal state, not an error.

export type CloneSourceProviderId = 'bitbucket' | 'github'

export type CloneSourceProvider = {
  id: CloneSourceProviderId
  label: string
  configured: boolean
  /** Empty when configured. Otherwise a short instruction, e.g. "Run gh auth login". */
  reason: string
}

export type CloneSourceRepo = {
  provider: CloneSourceProviderId
  /** `owner/name` — the identity shown to the user and used for de-duplication. */
  fullName: string
  /** SSH preferred, HTTPS fallback. Empty is not allowed: an unclonable repo must be omitted. */
  cloneUrl: string
  description: string
  /** Epoch ms of last push, or null when the host does not report it. Drives default ordering. */
  updatedAt: number | null
  isPrivate: boolean
}

export type CloneSourceListResult = {
  provider: CloneSourceProviderId
  repos: CloneSourceRepo[]
  /** Set when the provider was configured but the lookup failed; repos is then empty. */
  error: string
  /** True when the host had more than the cap; the list is usable but not exhaustive. */
  truncated: boolean
  /**
   * True when this host applies the caller's query itself, so `repos` is already the answer to it.
   * False means the query was not applied at all: the caller must filter the returned list, and the
   * UI must say the search only covers what is listed rather than imply the whole account.
   */
  searchesRemotely: boolean
}

/**
 * Safety bound on one response, not a search limit: with a server-side query the host does the
 * narrowing, and this only stops an unbounded browse from flooding the picker.
 */
export const CLONE_SOURCE_REPO_LIMIT = 200

export function findCloneSourceProvider(
  providers: readonly CloneSourceProvider[],
  id: CloneSourceProviderId
): CloneSourceProvider | null {
  return providers.find((provider) => provider.id === id) ?? null
}

/** The provider a freshly-opened picker should select: the first one actually usable. */
export function defaultCloneSourceProvider(
  providers: readonly CloneSourceProvider[]
): CloneSourceProviderId | null {
  return providers.find((provider) => provider.configured)?.id ?? null
}
