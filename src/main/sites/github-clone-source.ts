// GitHub as a source of repositories to start a new site from.
//
// GitHub is the one provider here with no credential of our own: the app rides the `gh` CLI's login
// rather than a token in the keychain, so "configured" means "gh is installed and logged in". That
// makes the two failure modes genuinely different to the user — install gh, versus run gh auth login
// — and neither is an error: an unconfigured provider is a normal state the picker renders as a
// prompt.
//
// Every process spawn goes through ghExecFileAsync so this inherits the runner's non-interactive env,
// rate-limit buckets, and transient-error retries; gh must never be spawned directly from here.

import { extractExecError } from '../git/exec-error'
import { ghExecFileAsync } from '../git/runner'
import { diagnoseGhAuth } from '../github/auth-diagnose'
import {
  CLONE_SOURCE_REPO_LIMIT,
  type CloneSourceListResult,
  type CloneSourceProvider,
  type CloneSourceRepo
} from '../../shared/site-clone-source-types'

const PROVIDER_LABEL = 'GitHub'

const NOT_INSTALLED_REASON = 'GitHub CLI (gh) is not installed.'
const NOT_LOGGED_IN_REASON = 'Run gh auth login to connect GitHub.'

/** Only the fields the picker renders; the full repo object is an order of magnitude larger. */
const REPO_FIELDS = 'nameWithOwner,sshUrl,url,description,pushedAt,isPrivate'

/**
 * Ask for one more than the cap so a full page tells us the account has more repos than we show.
 * The alternative — a second count query — doubles the latency of opening the picker.
 */
const REQUEST_LIMIT = CLONE_SOURCE_REPO_LIMIT + 1

function provider(configured: boolean, reason: string): CloneSourceProvider {
  return { id: 'github', label: PROVIDER_LABEL, configured, reason }
}

function emptyResult(error: string): CloneSourceListResult {
  return { provider: 'github', repos: [], error, truncated: false, searchesRemotely: false }
}

/**
 * Login state comes from `gh auth status` by way of diagnoseGhAuth, which already owns the parse of
 * that free-form output and the ENOENT-versus-logged-out distinction. A second parser here would
 * drift from it the first time gh changes its wording.
 */
export async function getGithubCloneSourceStatus(): Promise<CloneSourceProvider> {
  const diagnostic = await diagnoseGhAuth()
  if (!diagnostic.ghAvailable) {
    return provider(false, NOT_INSTALLED_REASON)
  }
  if (!diagnostic.activeAccount) {
    return provider(false, NOT_LOGGED_IN_REASON)
  }
  return provider(true, '')
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Epoch ms, or null when gh omitted the field or sent something Date can't read. */
function toEpochMs(value: unknown): number | null {
  const text = asText(value)
  if (text.length === 0) {
    return null
  }
  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? null : parsed
}

function toRepo(raw: unknown): CloneSourceRepo | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }
  const entry = raw as Record<string, unknown>
  const fullName = asText(entry.nameWithOwner)
  if (fullName.length === 0) {
    return null
  }
  // SSH first because the user's key is already trusted, so the clone runs without a credential
  // prompt; HTTPS is the fallback for accounts with no key registered.
  const cloneUrl = asText(entry.sshUrl) || asText(entry.url)
  // A repo we cannot clone is not a choice we can offer, so drop it rather than render a dead row.
  if (cloneUrl.length === 0) {
    return null
  }
  return {
    provider: 'github',
    fullName,
    cloneUrl,
    description: asText(entry.description),
    updatedAt: toEpochMs(entry.pushedAt),
    isPrivate: entry.isPrivate === true
  }
}

/** Most recently pushed first; repos with no push date sink below dated ones, name breaking ties. */
function byRecencyThenName(a: CloneSourceRepo, b: CloneSourceRepo): number {
  if (a.updatedAt !== b.updatedAt) {
    if (a.updatedAt === null) {
      return 1
    }
    if (b.updatedAt === null) {
      return -1
    }
    return b.updatedAt - a.updatedAt
  }
  if (a.fullName === b.fullName) {
    return 0
  }
  return a.fullName < b.fullName ? -1 : 1
}

function describeGhFailure(err: unknown): string {
  const { stderr, stdout } = extractExecError(err)
  const detail = (stderr.trim() || stdout.trim()).split('\n')[0]?.trim() ?? ''
  return detail.length > 0
    ? `Could not list GitHub repositories: ${detail}`
    : 'Could not list GitHub repositories.'
}

export async function listGithubCloneSourceRepos(): Promise<CloneSourceListResult> {
  const status = await getGithubCloneSourceStatus()
  // Not connected is the user's normal starting state, not a failure to report.
  if (!status.configured) {
    return emptyResult('')
  }

  let stdout = ''
  try {
    const result = await ghExecFileAsync([
      'repo',
      'list',
      '--json',
      REPO_FIELDS,
      '--limit',
      String(REQUEST_LIMIT)
    ])
    stdout = result.stdout
  } catch (err) {
    return emptyResult(describeGhFailure(err))
  }

  let payload: unknown
  try {
    payload = JSON.parse(stdout) as unknown
  } catch {
    return emptyResult('Could not read the repository list returned by gh.')
  }
  if (!Array.isArray(payload)) {
    return emptyResult('Could not read the repository list returned by gh.')
  }

  const repos: CloneSourceRepo[] = []
  for (const raw of payload) {
    const repo = toRepo(raw)
    // Skip the entry, not the list: one odd repo must not cost the user every other one.
    if (repo) {
      repos.push(repo)
    }
  }
  repos.sort(byRecencyThenName)

  return {
    provider: 'github',
    // Count the raw page, not the usable repos: the host had more than the cap either way.
    truncated: payload.length > CLONE_SOURCE_REPO_LIMIT,
    // Deliberately uncapped, matching the Bitbucket source. The single cap lives in
    // listCloneSourceRepos and runs AFTER already-present repos are excluded; capping here too
    // would spend a slot on a repo the user already has and then drop it, shrinking the page.
    repos,
    error: '',
    // `gh repo list` takes no name filter, and `gh search repos` needs an owner scope we do not have
    // plus a payload with no sshUrl, so GitHub is never searched host-side. Said plainly here so the
    // picker filters locally and tells the user the search only covers what is listed.
    searchesRemotely: false
  }
}
