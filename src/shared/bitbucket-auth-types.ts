// Wire types for the Bitbucket review credential (pull requests + build statuses).
//
// Declared in shared/ rather than beside the handlers because the preload type surface is compiled
// into the browser project while the handler module reaches into node:fs and electron. Same
// precedent as site-bind-types.ts.
//
// The secret never crosses IPC in the read direction: status reports only whether something is
// stored and which identity it belongs to.

export type BitbucketAuthMethod = 'oauth' | 'api-token' | 'access-token'

export type BitbucketAuthCredentialStatus = {
  /** True when a credential is stored on disk, regardless of whether it authenticates. */
  configured: boolean
  /** Which shape is stored, so the form can reopen on the right tab. */
  method: BitbucketAuthMethod | null
  /** Atlassian account email for `api-token`; null for OAuth / a bare access token. */
  email: string | null
  /** Bitbucket username from the last successful /user probe. */
  account: string | null
  /** True when credentials come from environment variables, which the UI cannot edit. */
  fromEnvironment: boolean
  /** False when the desktop OAuth consumer is not configured for this build. */
  oauthAvailable: boolean
}

/**
 * Why a saved sign-in stopped working:
 * - `refresh-rejected`: the OAuth token endpoint refused the saved refresh token (HTTP 400/401).
 * - `token-rejected`: the API answered 401 to the saved credential, even after a refresh attempt.
 * - `keychain-unreadable`: the saved credential file exists but could not be decrypted.
 */
export type BitbucketAuthLossReason = 'refresh-rejected' | 'token-rejected' | 'keychain-unreadable'

export type BitbucketAuthLoss = {
  reason: BitbucketAuthLossReason
  detectedAt: number
}

export type BitbucketAuthApi = {
  status: () => Promise<BitbucketAuthCredentialStatus>
  /** Opens Bitbucket in the browser and waits for the loopback callback. */
  beginOAuth: () => Promise<{ ok: true; account: string | null } | { error: string }>
  cancelOAuth: () => Promise<{ ok: true }>
  clear: () => Promise<{ ok: true } | { error: string }>
  /** The undismissed sign-in loss, for a window that mounts after it was detected. */
  pendingLoss: () => Promise<BitbucketAuthLoss | null>
  /** "Not now": stays quiet until the user reconnects, disconnects, or restarts the app. */
  dismissLoss: () => Promise<{ ok: true }>
  /** Fires with the loss when detected and with null once it is dismissed or resolved. */
  onLossChanged: (callback: (loss: BitbucketAuthLoss | null) => void) => () => void
}
