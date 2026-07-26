import { Buffer } from 'node:buffer'
import type { CheckStatus } from '../../shared/types'
import {
  deriveBitbucketBuildStatus,
  mapBitbucketPullRequest,
  mapBitbucketPullRequestState,
  type BitbucketPullRequestInfo,
  type RawBitbucketBuildStatus,
  type RawBitbucketPullRequest
} from './pull-request-mappers'
import { shouldHideNonOpenReviewOnDefaultBranch } from '../source-control/repo-default-branch'
import { getBitbucketRepoRef, type BitbucketRepoRef } from './repository-ref'
import {
  getHostedReviewLocalGitOptions,
  type HostedReviewExecutionOptions
} from '../source-control/hosted-review-git-options'
import { cancelUnreadResponseBody } from '../lib/unread-response-body'
import { getStoredBitbucketCredential } from './credential-store'

const DEFAULT_API_BASE_URL = 'https://api.bitbucket.org/2.0'
const REQUEST_TIMEOUT_MS = 5000
const ALL_PULL_REQUEST_STATES = ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'] as const

type BitbucketAuthConfig = {
  baseUrl: string
  accessToken: string | null
  email: string | null
  apiToken: string | null
}

export type BitbucketAuthStatus = {
  configured: boolean
  authenticated: boolean
  account: string | null
}

type RequestOptions = {
  searchParams?: Record<string, string | readonly string[]>
  timeoutMs?: number
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim() ?? ''
  return value.length > 0 ? value : null
}

function getAuthConfig(): BitbucketAuthConfig {
  const baseUrl = envValue('ORCA_BITBUCKET_API_BASE_URL') ?? DEFAULT_API_BASE_URL
  // Why env first: an operator setting these in the launch environment is making a deliberate
  // per-process override (CI, a scratch token), and that should beat whatever is in the keychain.
  const envConfig: BitbucketAuthConfig = {
    baseUrl,
    accessToken: envValue('ORCA_BITBUCKET_ACCESS_TOKEN'),
    email: envValue('ORCA_BITBUCKET_EMAIL'),
    apiToken: envValue('ORCA_BITBUCKET_API_TOKEN')
  }
  if (hasAuth(envConfig)) {
    return envConfig
  }
  const stored = getStoredBitbucketCredential()
  if (!stored) {
    return envConfig
  }
  return {
    baseUrl,
    accessToken: stored.accessToken.length > 0 ? stored.accessToken : null,
    email: stored.email.length > 0 ? stored.email : null,
    apiToken: stored.apiToken.length > 0 ? stored.apiToken : null
  }
}

/**
 * Whether launch-environment variables already supply credentials. The settings form uses this to
 * disable editing, because getAuthConfig lets the environment win and a saved credential would
 * silently have no effect.
 */
export function getBitbucketEnvironmentAuthStatus(): {
  configured: boolean
  method: 'api-token' | 'access-token' | null
  email: string | null
} {
  const accessToken = envValue('ORCA_BITBUCKET_ACCESS_TOKEN')
  const email = envValue('ORCA_BITBUCKET_EMAIL')
  const apiToken = envValue('ORCA_BITBUCKET_API_TOKEN')
  if (accessToken) {
    return { configured: true, method: 'access-token', email: null }
  }
  if (email && apiToken) {
    return { configured: true, method: 'api-token', email }
  }
  return { configured: false, method: null, email: null }
}

function hasAuth(config: BitbucketAuthConfig): boolean {
  return Boolean(config.accessToken || (config.email && config.apiToken))
}

function authHeaders(config: BitbucketAuthConfig): Record<string, string> {
  if (config.accessToken) {
    return { Authorization: `Bearer ${config.accessToken}` }
  }
  if (config.email && config.apiToken) {
    const encoded = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')
    return { Authorization: `Basic ${encoded}` }
  }
  return {}
}

function isStringArray(value: string | readonly string[]): value is readonly string[] {
  return Array.isArray(value)
}

function apiUrl(path: string, searchParams?: RequestOptions['searchParams']): string {
  const config = getAuthConfig()
  const base = config.baseUrl.replace(/\/+$/, '')
  const url = new URL(`${base}${path}`)
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (isStringArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, item)
        }
      } else {
        url.searchParams.set(key, value)
      }
    }
  }
  return url.toString()
}

async function requestJson<T>(
  path: string,
  options: RequestOptions = {},
  // Why: the existing-review lookup behind Create must distinguish a real
  // transport/auth failure from an accepted "no PR". When true, a failed request
  // throws instead of collapsing to null so callers never report false not_found.
  throwOnFailure = false
): Promise<T | null> {
  const config = getAuthConfig()
  // Why: without credentials Bitbucket answers a private repo with 404, not 401, so an
  // unconfigured install produced a stream of "Bitbucket request failed: HTTP 404" that read as a
  // missing repo. Fail closed and say what is actually wrong.
  if (!hasAuth(config)) {
    if (throwOnFailure) {
      throw new Error('Bitbucket is not configured. Add credentials in Settings → Integrations.')
    }
    return null
  }
  try {
    const response = await fetch(apiUrl(path, options.searchParams), {
      headers: {
        Accept: 'application/json',
        ...authHeaders(config)
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS)
    })
    if (!response.ok) {
      await cancelUnreadResponseBody(response)
      if (throwOnFailure) {
        throw new Error(`Bitbucket request failed: HTTP ${response.status}`)
      }
      return null
    }
    return (await response.json()) as T
  } catch (error) {
    if (throwOnFailure) {
      throw error
    }
    return null
  }
}

function encodedRepoPath(repo: BitbucketRepoRef): string {
  return `${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repoSlug)}`
}

function escapeBitbucketQueryString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function allStateFilter(): string {
  return `(${ALL_PULL_REQUEST_STATES.map((state) => `state = "${state}"`).join(' OR ')})`
}

async function getBuildStatus(
  repo: BitbucketRepoRef,
  headSha: string | undefined
): Promise<CheckStatus> {
  if (!headSha) {
    return 'neutral'
  }
  const data = await requestJson<{ values?: RawBitbucketBuildStatus[] }>(
    `/repositories/${encodedRepoPath(repo)}/commit/${encodeURIComponent(headSha)}/statuses/build`,
    { searchParams: { pagelen: '100' } }
  )
  return deriveBitbucketBuildStatus(data?.values ?? [])
}

async function normalizePullRequest(
  repo: BitbucketRepoRef,
  raw: RawBitbucketPullRequest
): Promise<BitbucketPullRequestInfo | null> {
  const headSha = raw.source?.commit?.hash?.trim()
  const status = await getBuildStatus(repo, headSha)
  return mapBitbucketPullRequest(raw, status)
}

export async function getBitbucketAuthStatus(): Promise<BitbucketAuthStatus> {
  const config = getAuthConfig()
  if (!hasAuth(config)) {
    return { configured: false, authenticated: false, account: null }
  }
  const user = await requestJson<{
    username?: string | null
    display_name?: string | null
    account_id?: string | null
  }>('/user', { timeoutMs: 4000 })
  return {
    configured: true,
    authenticated: user !== null,
    account: user?.username ?? user?.display_name ?? user?.account_id ?? null
  }
}

export async function getBitbucketPullRequest(
  repoPath: string,
  prNumber: number,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<BitbucketPullRequestInfo | null> {
  const repo = await getBitbucketRepoRef(
    repoPath,
    connectionId,
    getHostedReviewLocalGitOptions(options)
  )
  if (!repo) {
    return null
  }
  const raw = await requestJson<RawBitbucketPullRequest>(
    `/repositories/${encodedRepoPath(repo)}/pullrequests/${encodeURIComponent(String(prNumber))}`
  )
  return raw ? normalizePullRequest(repo, raw) : null
}

export async function getBitbucketPullRequestForBranch(
  repoPath: string,
  branch: string,
  linkedPRNumber?: number | null,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {},
  throwOnFailure = false
): Promise<BitbucketPullRequestInfo | null> {
  const branchName = branch.replace(/^refs\/heads\//, '')
  if (!branchName && linkedPRNumber == null) {
    return null
  }

  const repo = await getBitbucketRepoRef(
    repoPath,
    connectionId,
    getHostedReviewLocalGitOptions(options)
  )
  if (!repo) {
    return null
  }

  if (branchName) {
    const query = [
      `source.branch.name = "${escapeBitbucketQueryString(branchName)}"`,
      allStateFilter()
    ].join(' AND ')
    const list = await requestJson<{ values?: RawBitbucketPullRequest[] }>(
      `/repositories/${encodedRepoPath(repo)}/pullrequests`,
      {
        searchParams: {
          pagelen: '1',
          sort: '-updated_on',
          q: query,
          state: ALL_PULL_REQUEST_STATES
        }
      },
      throwOnFailure
    )
    const raw = list?.values?.[0]
    if (raw) {
      // Why (#9171): discard a non-open implicit branch match on the repo
      // default branch and fall through to the linked-number fallback below.
      const hideOnDefaultBranch = await shouldHideNonOpenReviewOnDefaultBranch({
        state: mapBitbucketPullRequestState(raw.state),
        reviewNumber: raw.id ?? null,
        linkedReviewNumber: linkedPRNumber,
        branchName,
        repoPath,
        connectionId,
        localGitOptions: getHostedReviewLocalGitOptions(options)
      })
      if (!hideOnDefaultBranch) {
        return normalizePullRequest(repo, raw)
      }
    }
  }

  if (typeof linkedPRNumber !== 'number') {
    return null
  }
  const raw = await requestJson<RawBitbucketPullRequest>(
    `/repositories/${encodedRepoPath(repo)}/pullrequests/${encodeURIComponent(String(linkedPRNumber))}`,
    {},
    throwOnFailure
  )
  return raw ? normalizePullRequest(repo, raw) : null
}

/**
 * Existing-review lookup that surfaces transport/auth failures instead of
 * collapsing them to null. The hosted-review creation preflight uses this so a
 * failed lookup becomes `reviewLookupOutcome: 'unavailable'`, never a false
 * "No pull request found".
 */
export function getBitbucketPullRequestForBranchOrThrow(
  repoPath: string,
  branch: string,
  linkedPRNumber?: number | null,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<BitbucketPullRequestInfo | null> {
  return getBitbucketPullRequestForBranch(
    repoPath,
    branch,
    linkedPRNumber,
    connectionId,
    options,
    true
  )
}

export async function getBitbucketRepoSlug(
  repoPath: string,
  connectionId?: string | null,
  options: HostedReviewExecutionOptions = {}
): Promise<BitbucketRepoRef | null> {
  return getBitbucketRepoRef(repoPath, connectionId, getHostedReviewLocalGitOptions(options))
}
