// The provider-agnostic half of "add a site from a repo you already have on a git host".
//
// Each host keeps its own module (bitbucket-workspace-repos.ts, github-clone-source.ts) because
// they authenticate nothing alike — Bitbucket reads a stored App Password, GitHub rides the `gh`
// CLI's own login. This file is the seam that lets the picker treat them as one list.
//
// Two rules the UI depends on:
//   * Every provider is always reported, configured or not. Hiding an unconfigured Bitbucket would
//     leave a user who has never opened Settings with an empty dialog and no way to learn why.
//   * A provider that blows up degrades to `configured: false` carrying its own message. One broken
//     host must not blank out the other, which is the whole reason the picker lists both.

import {
  CLONE_SOURCE_REPO_LIMIT,
  type CloneSourceListResult,
  type CloneSourceProvider,
  type CloneSourceProviderId,
  type CloneSourceRepo
} from '../../shared/site-clone-source-types'
import type { BitbucketRepoListResult } from '../../shared/site-bind-types'
import {
  getBitbucketCredentialRecord,
  getBitbucketCredentials,
  getBitbucketCredentialStatus
} from './bitbucket-credential-store'
import { fetchBitbucketJson, listBitbucketWorkspaceRepos } from './bitbucket-workspace-repos'
import { getGithubCloneSourceStatus, listGithubCloneSourceRepos } from './github-clone-source'

/** Display order in the picker. Bitbucket first: it is the one ocsites shipped with. */
export const CLONE_SOURCE_PROVIDER_IDS = ['bitbucket', 'github'] as const

/** Used when a provider throws before it can report its own label. */
const PROVIDER_LABELS: Record<CloneSourceProviderId, string> = {
  bitbucket: 'Bitbucket',
  github: 'GitHub'
}

const SETTINGS_HINT = 'Settings → Integrations'

export function isCloneSourceProviderId(value: unknown): value is CloneSourceProviderId {
  return (
    typeof value === 'string' && (CLONE_SOURCE_PROVIDER_IDS as readonly string[]).includes(value)
  )
}

function getBitbucketCloneSourceStatus(): CloneSourceProvider {
  const base = { id: 'bitbucket', label: PROVIDER_LABELS.bitbucket } as const
  const credential = getBitbucketCredentialStatus()
  if (!credential.configured) {
    return {
      ...base,
      configured: false,
      reason: `Add a Bitbucket App Password in ${SETTINGS_HINT}.`
    }
  }
  // A credential without a workspace cannot list anything: the Bitbucket repo endpoint is scoped to
  // one workspace, so an empty slug is just as unusable as a missing password.
  const workspace = getBitbucketCredentialRecord()?.workspace ?? ''
  if (workspace.length === 0) {
    return { ...base, configured: false, reason: `Set a Bitbucket workspace in ${SETTINGS_HINT}.` }
  }
  return { ...base, configured: true, reason: '' }
}

/**
 * Both providers, always, in `CLONE_SOURCE_PROVIDER_IDS` order. Probed concurrently because the
 * GitHub side shells out to `gh` and would otherwise serialise behind the keychain read.
 */
export async function listCloneSourceProviders(): Promise<CloneSourceProvider[]> {
  return Promise.all([
    resolveProvider('bitbucket', async () => getBitbucketCloneSourceStatus()),
    resolveProvider('github', getGithubCloneSourceStatus)
  ])
}

async function resolveProvider(
  id: CloneSourceProviderId,
  probe: () => Promise<CloneSourceProvider>
): Promise<CloneSourceProvider> {
  try {
    return await probe()
  } catch (error) {
    // Degrade, never reject: the sibling provider is still perfectly usable and the user gets the
    // failure as an actionable reason on the row it belongs to.
    return {
      id,
      label: PROVIDER_LABELS[id],
      configured: false,
      reason: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function listCloneSourceRepos(
  provider: CloneSourceProviderId
): Promise<CloneSourceListResult> {
  if (provider === 'bitbucket') {
    return listBitbucketCloneSourceRepos()
  }
  if (provider === 'github') {
    return listGithubCloneSourceRepos()
  }
  // Reachable only from IPC, where the argument is renderer-supplied and therefore untrusted.
  throw new TypeError(`Unknown clone source provider: ${String(provider)}`)
}

async function listBitbucketCloneSourceRepos(): Promise<CloneSourceListResult> {
  // No `preferCache`: the picker is often opened right after creating a repo, and a stale cache
  // would hide it. The lister still falls back to its cache when the live fetch fails.
  const result = await listBitbucketWorkspaceRepos({
    workspace: getBitbucketCredentialRecord()?.workspace ?? '',
    credentials: getBitbucketCredentials(),
    fetchJson: fetchBitbucketJson
  })
  const usable = toCloneSourceRepos(result)
  const truncated = usable.length > CLONE_SOURCE_REPO_LIMIT
  return {
    provider: 'bitbucket',
    repos: truncated ? usable.slice(0, CLONE_SOURCE_REPO_LIMIT) : usable,
    error: result.error,
    truncated
  }
}

function toCloneSourceRepos(result: BitbucketRepoListResult): CloneSourceRepo[] {
  const repos: CloneSourceRepo[] = []
  for (const repo of result.repos) {
    // The picker's only action is "clone this", so a repo Bitbucket gave no clone link for is dead
    // weight — omitted rather than listed as an un-actionable row.
    if (repo.cloneUrl.length === 0) {
      continue
    }
    repos.push({
      provider: 'bitbucket',
      fullName: repo.fullName || repo.slug,
      cloneUrl: repo.cloneUrl,
      description: repo.description,
      updatedAt: toEpochMs(repo.updatedOn),
      // Bitbucket's listing asks for a narrow field mask that omits `is_private`. Assume private:
      // over-reporting privacy is harmless, whereas labelling a private repo public is not.
      isPrivate: true
    })
  }
  return repos
}

function toEpochMs(value: string): number | null {
  if (value.length === 0) {
    return null
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}
