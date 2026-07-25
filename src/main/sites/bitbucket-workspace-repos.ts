// Bitbucket workspace repository listing, ported from ocsites' bitbucket.py.
//
// Orca's src/main/bitbucket/client.ts is pull-request oriented and authenticates from ORCA_BITBUCKET_*
// environment variables only (client.ts:41-53). The "+ New Site" flow needs the other half of what
// ocsites had: a stored App Password and the workspace's repo list. That is all this module does —
// cloning is Orca's existing `repos:clone`, which already streams progress.
//
// Deliberately free of Electron and node:fs so it stays unit-testable: credentials and the HTTP call
// are injected, and the IPC layer binds the real keychain-backed store.

import { Buffer } from 'node:buffer'
import { cancelUnreadResponseBody } from '../lib/unread-response-body'
import type { BitbucketRepoListResult, BitbucketRepoSummary } from '../../shared/site-bind-types'

export type BitbucketCredentials = {
  /** Atlassian account email for an API token, or the Bitbucket nickname for a legacy App Password. */
  username: string
  appPassword: string
}

export type BitbucketApiResponse = { ok: boolean; status: number; body: unknown }

export type BitbucketFetchJson = (
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal
) => Promise<BitbucketApiResponse>

export const BITBUCKET_API_BASE = 'https://api.bitbucket.org/2.0'

/** Ask Bitbucket for only the fields the picker renders — the full repo object is ~40x larger. */
const REPO_FIELDS =
  'size,next,values.slug,values.full_name,values.description,values.updated_on,values.links.clone'

const PAGE_LENGTH = 100
/** Hard stop so a malformed `next` chain cannot spin forever; 100 pages is 10k repos. */
const MAX_PAGES = 100
const REQUEST_TIMEOUT_MS = 15_000

const cacheByWorkspace = new Map<string, BitbucketRepoSummary[]>()

export function bitbucketAuthHeaders(credentials: BitbucketCredentials): Record<string, string> {
  const basic = Buffer.from(`${credentials.username}:${credentials.appPassword}`, 'utf8').toString(
    'base64'
  )
  return { Authorization: `Basic ${basic}`, Accept: 'application/json' }
}

export function bitbucketWorkspaceReposUrl(workspace: string): string {
  const query = new URLSearchParams({
    pagelen: String(PAGE_LENGTH),
    fields: REPO_FIELDS,
    sort: '-updated_on'
  })
  return `${BITBUCKET_API_BASE}/repositories/${encodeURIComponent(workspace)}?${query.toString()}`
}

/** Workspace slug out of any Bitbucket remote, for auto-detection from an existing checkout. */
export function detectBitbucketWorkspace(cloneUrl: string): string {
  return /bitbucket\.org[:/]([^/]+)\//.exec(cloneUrl)?.[1] ?? ''
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * SSH first, HTTPS second, then whatever is left — ocsites' preference (bitbucket.py:190-198).
 * SSH avoids a credential prompt during clone because the user's key is already trusted.
 */
export function pickBitbucketCloneUrl(links: unknown): string {
  const entries = Array.isArray(links) ? links.map(asRecord) : []
  const byName = (name: string): string =>
    asText(entries.find((entry) => asText(entry.name) === name)?.href)
  return byName('ssh') || byName('https') || asText(entries[0]?.href)
}

function toRepoSummaries(body: unknown): { repos: BitbucketRepoSummary[]; next: string } {
  const page = asRecord(body)
  const values = Array.isArray(page.values) ? page.values : []
  const repos: BitbucketRepoSummary[] = []
  for (const raw of values) {
    const entry = asRecord(raw)
    const slug = asText(entry.slug)
    if (slug.length === 0) {
      continue
    }
    repos.push({
      slug,
      fullName: asText(entry.full_name) || slug,
      cloneUrl: pickBitbucketCloneUrl(asRecord(entry.links).clone),
      description: asText(entry.description),
      updatedOn: asText(entry.updated_on)
    })
  }
  return { repos, next: asText(page.next) }
}

function describeFailure(status: number, workspace: string): string {
  if (status === 401) {
    return 'Bitbucket rejected the stored credentials (HTTP 401). For an Atlassian API token the username must be your account email.'
  }
  if (status === 403) {
    return 'Authenticated, but the token is missing a read scope (HTTP 403). Grant read:repository and read:workspace.'
  }
  if (status === 404) {
    return `Workspace '${workspace}' was not found, or the token has no access to it (HTTP 404).`
  }
  return `Bitbucket request failed: HTTP ${status}.`
}

export type BitbucketRepoListRequest = {
  workspace: string
  /** Null when no App Password is stored — reported as not-configured rather than thrown. */
  credentials: BitbucketCredentials | null
  fetchJson: BitbucketFetchJson
  /** Serve the process cache when it is populated, skipping the network entirely. */
  preferCache?: boolean
  signal?: AbortSignal
}

export async function listBitbucketWorkspaceRepos(
  request: BitbucketRepoListRequest
): Promise<BitbucketRepoListResult> {
  const workspace = request.workspace.trim()
  const cached = cacheByWorkspace.get(workspace) ?? null
  const base = { workspace, repos: [] as BitbucketRepoSummary[], fromCache: false }

  if (workspace.length === 0) {
    return { ...base, configured: true, error: 'No Bitbucket workspace is configured.' }
  }
  const credentials = request.credentials
  if (!credentials || credentials.username.length === 0 || credentials.appPassword.length === 0) {
    return {
      ...base,
      configured: false,
      error: 'No Bitbucket App Password is stored for Muster.'
    }
  }
  if (request.preferCache && cached) {
    return { ...base, configured: true, repos: cached, fromCache: true, error: '' }
  }

  const headers = bitbucketAuthHeaders(credentials)
  const collected: BitbucketRepoSummary[] = []
  const seenUrls = new Set<string>()
  let url = bitbucketWorkspaceReposUrl(workspace)

  for (let page = 0; page < MAX_PAGES && url.length > 0; page += 1) {
    if (seenUrls.has(url)) {
      break
    }
    seenUrls.add(url)
    let response: BitbucketApiResponse
    try {
      response = await request.fetchJson(url, headers, request.signal)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return finishWithFailure(workspace, collected, cached, `Could not reach Bitbucket: ${reason}`)
    }
    if (!response.ok) {
      return finishWithFailure(
        workspace,
        collected,
        cached,
        describeFailure(response.status, workspace)
      )
    }
    const { repos, next } = toRepoSummaries(response.body)
    collected.push(...repos)
    url = next
  }

  cacheByWorkspace.set(workspace, collected)
  return { workspace, configured: true, repos: collected, fromCache: false, error: '' }
}

/** A partial page still beats nothing; otherwise fall back to the last good list for this workspace. */
function finishWithFailure(
  workspace: string,
  collected: BitbucketRepoSummary[],
  cached: BitbucketRepoSummary[] | null,
  error: string
): BitbucketRepoListResult {
  if (collected.length > 0) {
    return { workspace, configured: true, repos: collected, fromCache: false, error }
  }
  return {
    workspace,
    configured: true,
    repos: cached ?? [],
    fromCache: cached !== null,
    error
  }
}

export function clearBitbucketRepoCache(): void {
  cacheByWorkspace.clear()
}

/** The production HTTP binding. Kept here so callers never hand-roll the timeout or the decode. */
export const fetchBitbucketJson: BitbucketFetchJson = async (url, headers, signal) => {
  const response = await fetch(url, {
    headers,
    signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!response.ok) {
    await cancelUnreadResponseBody(response)
    return { ok: false, status: response.status, body: null }
  }
  return { ok: true, status: response.status, body: (await response.json()) as unknown }
}
