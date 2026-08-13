// Refresh a stored Bitbucket OAuth session. Rotating refresh tokens (May 2026)
// replace the saved refresh token on every successful refresh.

import { getStoredBitbucketCredential, setStoredBitbucketCredential } from './credential-store'
import { getBitbucketOAuthConsumer } from './oauth-config'
import { refreshBitbucketOAuthToken } from './oauth-flow'

const EXPIRY_SKEW_MS = 60_000

let refreshInFlight: Promise<string | null> | null = null

export function storedBitbucketOAuthNeedsRefresh(now = Date.now()): boolean {
  const stored = getStoredBitbucketCredential()
  if (!stored?.refreshToken) {
    return false
  }
  if (!stored.accessToken) {
    return true
  }
  return stored.expiresAt > 0 && stored.expiresAt - EXPIRY_SKEW_MS <= now
}

export function ensureFreshBitbucketAccessToken(force = false): Promise<string | null> {
  const stored = getStoredBitbucketCredential()
  if (!stored) {
    return Promise.resolve(null)
  }
  if (!stored.refreshToken) {
    return Promise.resolve(stored.accessToken ? stored.accessToken : null)
  }
  if (!force && !storedBitbucketOAuthNeedsRefresh()) {
    return Promise.resolve(stored.accessToken)
  }
  if (refreshInFlight) {
    return refreshInFlight
  }
  refreshInFlight = refreshStoredOAuthToken().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

async function refreshStoredOAuthToken(): Promise<string | null> {
  const stored = getStoredBitbucketCredential()
  const consumer = getBitbucketOAuthConsumer()
  if (!stored?.refreshToken || !consumer) {
    return stored?.accessToken ? stored.accessToken : null
  }
  try {
    const next = await refreshBitbucketOAuthToken(consumer, stored.refreshToken)
    setStoredBitbucketCredential({
      accessToken: next.accessToken,
      refreshToken: next.refreshToken || stored.refreshToken,
      expiresAt: next.expiresAt,
      account: stored.account
    })
    return next.accessToken
  } catch {
    return stored.accessToken.length > 0 ? stored.accessToken : null
  }
}

/** Test-only. */
export function _resetBitbucketOAuthRefreshForTests(): void {
  refreshInFlight = null
}
