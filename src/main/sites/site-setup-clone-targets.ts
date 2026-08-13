// Resolving the `reponame` from a `muster://configure?…` link into repositories the setup flow can
// actually clone.
//
// The link carries a human-typed name, not a clone URL — ocsites resolved it against the Bitbucket
// workspace at setup time, and so do we. Everything here is composition: the credential store owns
// the secret, bitbucket-workspace-repos.ts owns the listing (paging, caching, SSH-preferred clone
// URL, and the friendly HTTP-status messages), and `repos:clone` owns the clone itself.
//
// Two states the UI must tell apart, which is why this never throws for a bad lookup:
//   no connector      -> `connectorConfigured: false`, empty `error`; point the user at Settings
//   lookup failed     -> `connectorConfigured: true` plus an `error` to show verbatim

import type { BitbucketRepoSummary } from '../../shared/site-bind-types'
import type {
  SiteSetupCloneResolution,
  SiteSetupCloneTarget
} from '../../shared/site-setup-flow-types'
import { getBitbucketCredentialRecord } from './bitbucket-credential-store'
import { resolveBitbucketListingCredentials } from './bitbucket-listing-auth'
import { fetchBitbucketJson, listBitbucketWorkspaceRepos } from './bitbucket-workspace-repos'

/** Enough to disambiguate a fuzzy name; past that the picker is noise rather than help. */
const MAX_CLONE_TARGETS = 10

/** Lower ranks win. Only rank 0 is reported as an exact match. */
const RANK_EXACT = 0
const RANK_CASE_INSENSITIVE = 1
const RANK_SUBSTRING = 2
const RANK_NO_MATCH = 3

type RankedTarget = { rank: number; repo: BitbucketRepoSummary }

/**
 * A link may name the repo either way: `adamson-eoi` or `efront_au/adamson-eoi`. The trailing
 * segment is always the slug; a leading segment is the workspace, which beats the stored default
 * because the link is the more specific instruction.
 */
function splitReponame(reponame: string): { workspace: string; slug: string } {
  const segments = reponame
    .trim()
    .replace(/\.git$/i, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
  return {
    workspace: segments.length > 1 ? (segments.at(-2) ?? '') : '',
    slug: segments.at(-1) ?? ''
  }
}

/**
 * Case-insensitive equality is deliberately *not* an exact match: Bitbucket slugs are lowercase by
 * convention, so a case difference means the link and the remote disagree about the name, and the
 * user should confirm rather than have the flow pick silently.
 */
function rankRepo(repo: BitbucketRepoSummary, reponame: string, slug: string): number {
  if (repo.slug === slug || repo.fullName === reponame) {
    return RANK_EXACT
  }
  const wanted = slug.toLowerCase()
  const repoSlug = repo.slug.toLowerCase()
  const repoFullName = repo.fullName.toLowerCase()
  if (repoSlug === wanted || repoFullName === reponame.toLowerCase()) {
    return RANK_CASE_INSENSITIVE
  }
  if (repoSlug.includes(wanted) || repoFullName.includes(wanted)) {
    return RANK_SUBSTRING
  }
  return RANK_NO_MATCH
}

function rankCloneTargets(
  repos: BitbucketRepoSummary[],
  reponame: string,
  slug: string
): SiteSetupCloneTarget[] {
  const matched: RankedTarget[] = []
  for (const repo of repos) {
    // A repo with no clone remote at all cannot be offered: the button would have nothing to run.
    if (repo.cloneUrl.length === 0) {
      continue
    }
    const rank = rankRepo(repo, reponame, slug)
    if (rank !== RANK_NO_MATCH) {
      matched.push({ rank, repo })
    }
  }
  // Sort is stable, so within a rank the listing order (most recently updated first) survives.
  matched.sort((left, right) => left.rank - right.rank)
  return matched.slice(0, MAX_CLONE_TARGETS).map(({ rank, repo }) => ({
    provider: 'bitbucket',
    fullName: repo.fullName,
    // Already SSH-preferred with an HTTPS fallback — pickBitbucketCloneUrl decided this upstream.
    cloneUrl: repo.cloneUrl,
    exactMatch: rank === RANK_EXACT
  }))
}

export async function resolveSiteSetupCloneTargets(
  reponame: string
): Promise<SiteSetupCloneResolution> {
  // One read of the record rather than a status call plus a credentials call: both derive from the
  // same decrypt, and we need the secret anyway to list.
  const record = getBitbucketCredentialRecord()
  const credentials = await resolveBitbucketListingCredentials()

  const { workspace: linkWorkspace, slug } = splitReponame(reponame)
  const workspace = linkWorkspace || record?.workspace || ''

  if (!credentials) {
    return { connectorConfigured: false, targets: [], error: '' }
  }
  if (slug.length === 0) {
    return { connectorConfigured: true, targets: [], error: '' }
  }

  const listed = await listBitbucketWorkspaceRepos({
    workspace,
    credentials,
    fetchJson: fetchBitbucketJson,
    // The planner re-runs as stages advance; the process cache keeps that from re-hitting Bitbucket
    // on every rebuild. Explicit refresh lives on the picker, not here.
    preferCache: true
  })

  if (!listed.configured) {
    return { connectorConfigured: false, targets: [], error: '' }
  }
  // A partial or cached list cannot support "no match found", so surface the error instead of
  // ranking against a list we know is incomplete.
  if (listed.error.length > 0) {
    return { connectorConfigured: true, targets: [], error: listed.error }
  }
  return {
    connectorConfigured: true,
    targets: rankCloneTargets(listed.repos, reponame.trim(), slug),
    error: ''
  }
}
