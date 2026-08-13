// Shared Bitbucket auth for site listing / clone-source browse. Uses the same
// OAuth (or env) session as Settings → Integrations, not the legacy App Password.

import { getStoredBitbucketCredential } from '../bitbucket/credential-store'
import { ensureFreshBitbucketAccessToken } from '../bitbucket/oauth-tokens'
import type { BitbucketCredentials } from './bitbucket-workspace-repos'

function envValue(name: string): string {
  return process.env[name]?.trim() ?? ''
}

export function isBitbucketListingConfigured(): boolean {
  if (envValue('ORCA_BITBUCKET_ACCESS_TOKEN')) {
    return true
  }
  if (envValue('ORCA_BITBUCKET_EMAIL') && envValue('ORCA_BITBUCKET_API_TOKEN')) {
    return true
  }
  const stored = getStoredBitbucketCredential()
  return Boolean(
    stored && (stored.refreshToken || stored.accessToken || (stored.email && stored.apiToken))
  )
}

export async function resolveBitbucketListingCredentials(): Promise<BitbucketCredentials | null> {
  const envToken = envValue('ORCA_BITBUCKET_ACCESS_TOKEN')
  if (envToken) {
    return { accessToken: envToken }
  }
  const envEmail = envValue('ORCA_BITBUCKET_EMAIL')
  const envApiToken = envValue('ORCA_BITBUCKET_API_TOKEN')
  if (envEmail && envApiToken) {
    return { username: envEmail, appPassword: envApiToken }
  }
  const oauthToken = await ensureFreshBitbucketAccessToken()
  if (oauthToken) {
    return { accessToken: oauthToken }
  }
  const stored = getStoredBitbucketCredential()
  if (stored?.email && stored.apiToken) {
    return { username: stored.email, appPassword: stored.apiToken }
  }
  return null
}
