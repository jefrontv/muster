// Wire types for the Bitbucket review credential (pull requests + build statuses).
//
// Declared in shared/ rather than beside the handlers because the preload type surface is compiled
// into the browser project while the handler module reaches into node:fs and electron. Same
// precedent as site-bind-types.ts.
//
// The secret never crosses IPC in the read direction: status reports only whether something is
// stored and which identity it belongs to.

export type BitbucketAuthMethod = 'api-token' | 'access-token'

export type BitbucketAuthCredentialStatus = {
  /** True when a credential is stored on disk, regardless of whether it authenticates. */
  configured: boolean
  /** Which shape is stored, so the form can reopen on the right tab. */
  method: BitbucketAuthMethod | null
  /** Atlassian account email for `api-token`; null for a bare access token. */
  email: string | null
  /** True when credentials come from environment variables, which the UI cannot edit. */
  fromEnvironment: boolean
}

export type BitbucketAuthCredentialInput = {
  email?: string
  apiToken?: string
  accessToken?: string
}

export type BitbucketAuthApi = {
  status: () => Promise<BitbucketAuthCredentialStatus>
  /** Persists to the OS keychain. Rejects when the platform has no secure storage. */
  setCredentials: (input: BitbucketAuthCredentialInput) => Promise<{ ok: true } | { error: string }>
  clear: () => Promise<{ ok: true } | { error: string }>
}
