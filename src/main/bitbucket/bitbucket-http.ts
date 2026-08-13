// Authenticated Bitbucket Cloud HTTP. Env credentials beat the keychain; OAuth
// access tokens are refreshed before a call and once more after a 401.

import { Buffer } from 'node:buffer'
import { cancelUnreadResponseBody } from '../lib/unread-response-body'
import { getStoredBitbucketCredential } from './credential-store'
import { ensureFreshBitbucketAccessToken } from './oauth-tokens'

const DEFAULT_API_BASE_URL = 'https://api.bitbucket.org/2.0'
const REQUEST_TIMEOUT_MS = 5000

type BitbucketAuthConfig = {
  baseUrl: string
  accessToken: string | null
  email: string | null
  apiToken: string | null
}

export type BitbucketRequestOptions = {
  searchParams?: Record<string, string | readonly string[]>
  timeoutMs?: number
  oauthRetried?: boolean
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim() ?? ''
  return value.length > 0 ? value : null
}

function getAuthConfig(): BitbucketAuthConfig {
  const baseUrl = envValue('ORCA_BITBUCKET_API_BASE_URL') ?? DEFAULT_API_BASE_URL
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

export function getBitbucketEnvironmentAuthStatus(): {
  configured: boolean
  method: 'api-token' | 'access-token' | null
  email: string | null
  account: string | null
} {
  const accessToken = envValue('ORCA_BITBUCKET_ACCESS_TOKEN')
  const email = envValue('ORCA_BITBUCKET_EMAIL')
  const apiToken = envValue('ORCA_BITBUCKET_API_TOKEN')
  if (accessToken) {
    return { configured: true, method: 'access-token', email: null, account: null }
  }
  if (email && apiToken) {
    return { configured: true, method: 'api-token', email, account: null }
  }
  return { configured: false, method: null, email: null, account: null }
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

function apiUrl(path: string, searchParams?: BitbucketRequestOptions['searchParams']): string {
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

export function bitbucketHasAuth(): boolean {
  return hasAuth(getAuthConfig())
}

export async function bitbucketRequestJson<T>(
  path: string,
  options: BitbucketRequestOptions = {},
  throwOnFailure = false
): Promise<T | null> {
  await ensureFreshBitbucketAccessToken()
  const config = getAuthConfig()
  if (!hasAuth(config)) {
    if (throwOnFailure) {
      throw new Error('Bitbucket is not configured. Connect Bitbucket in Settings → Integrations.')
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
    if (response.status === 401 && !options.oauthRetried) {
      await cancelUnreadResponseBody(response)
      const refreshed = await ensureFreshBitbucketAccessToken(true)
      if (refreshed) {
        return bitbucketRequestJson<T>(path, { ...options, oauthRetried: true }, throwOnFailure)
      }
    }
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
