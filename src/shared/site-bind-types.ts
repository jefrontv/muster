// Wire types for the `muster://` bind flow and the Bitbucket workspace browser.
//
// These live in shared/ for the same reason as site-stack-types.ts: the preload type surface is
// compiled into the browser project, so importing them from a main module would drag node:fs into
// the renderer build. The main modules re-export them, so there is still one definition.
//
// A bind link carries a plaintext password. Nothing here holds it — `passwordProvided` is the only
// trace that crosses IPC, and the value itself never leaves the main process.

import type { SiteResult, SiteSummary } from './site-types'

/** Non-secret fields a bind link can carry. Every one is optional except hostname and username. */
export type SiteBindFields = {
  /** `workspace/slug` or a bare slug; used to find or clone the local checkout. */
  reponame: string
  hostname: string
  username: string
  rootPath: string
  liveDomain: string
  liveDomainProtocol: 'http' | 'https'
  /** Derived from reponame/liveDomain, e.g. acme.local — never taken from the link directly. */
  localDomain: string
  /** Target environment name; the link's `branch`/`env` parameter. */
  environment: string
  deployCommand: string
  themeDistPath: string
  notes: string
}

/** A local checkout the link could bind to. */
export type SiteBindCandidate = {
  path: string
  displayName: string
  /** Set when a Site record already exists for this path — confirming updates it in place. */
  siteId: string | null
  repoId: string | null
  exists: boolean
}

export type PendingSiteBind = {
  requestId: string
  receivedAt: number
  fields: SiteBindFields
  /** True when the link carried a password. The value stays in main and is never sent here. */
  passwordProvided: boolean
  candidates: SiteBindCandidate[]
  /** Derived `git@bitbucket.org:<reponame>.git` when the link named a workspace-qualified repo. */
  suggestedCloneUrl: string
}

export type SiteBindApplied = {
  siteId: string
  path: string
  environment: string
  created: boolean
  secretStored: boolean
  /** Why the password could not be stored (missing OS keychain); empty on success. */
  secretError: string
}

export type BitbucketRepoSummary = {
  slug: string
  fullName: string
  /** SSH when the repo offers it, HTTPS otherwise — matching ocsites' preference. */
  cloneUrl: string
  description: string
  updatedOn: string
}

export type BitbucketRepoListResult = {
  /** False when no App Password is stored: a not-configured report, not a failure. */
  configured: boolean
  workspace: string
  repos: BitbucketRepoSummary[]
  /** True when `repos` came from the process cache instead of a live fetch. */
  fromCache: boolean
  /** Why the live fetch did not happen or did not finish; empty on a clean fetch. */
  error: string
}

export type BitbucketCredentialStatus = {
  configured: boolean
  /** The stored account identifier. The App Password itself is never returned. */
  username: string
  workspace: string
}

/**
 * The preload surface for the bind flow. Defined here so `src/preload/api-types.ts` and the
 * renderer agree by construction instead of by two hand-copied shapes.
 */
export type SiteBindApi = {
  /** Catch-up read: a link can land before the renderer mounts. Also subscribes the caller. */
  pending: () => Promise<SiteResult<PendingSiteBind | null>>
  dismiss: (requestId: string) => Promise<SiteResult<null>>
  /** The only call that writes. Nothing about a link is persisted until the user confirms. */
  confirm: (args: {
    requestId: string
    path: string
  }) => Promise<SiteResult<{ applied: SiteBindApplied; summary: SiteSummary }>>
  generate: (fields: Partial<SiteBindFields> & { password?: string }) => Promise<SiteResult<string>>
  onRequest: (callback: (pending: PendingSiteBind) => void) => () => void
}

export type SiteBitbucketApi = {
  status: () => Promise<SiteResult<BitbucketCredentialStatus>>
  /** Omitted fields keep their stored value; the App Password is write-only. */
  setCredentials: (args: {
    username?: string
    appPassword?: string
    workspace?: string
  }) => Promise<SiteResult<null>>
  listRepos: (args?: {
    workspace?: string
    refresh?: boolean
  }) => Promise<SiteResult<BitbucketRepoListResult>>
}
