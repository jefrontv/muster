// IPC for Bitbucket review auth: OAuth Connect in Settings → Integrations.
// Tokens never leave main on the read path. status reports identity only.

import { ipcMain } from 'electron'
import {
  clearStoredBitbucketCredential,
  getStoredBitbucketCredentialStatus,
  setStoredBitbucketCredential
} from '../bitbucket/credential-store'
import { getBitbucketAuthStatus, getBitbucketEnvironmentAuthStatus } from '../bitbucket/client'
import { isBitbucketOAuthAvailable } from '../bitbucket/oauth-config'
import { beginBitbucketOAuthLogin, cancelBitbucketOAuth } from '../bitbucket/oauth-flow'
import { _resetPreflightCache } from './preflight'
import type { BitbucketAuthCredentialStatus } from '../../shared/bitbucket-auth-types'

const BITBUCKET_AUTH_CHANNELS = [
  'bitbucketAuth:status',
  'bitbucketAuth:beginOAuth',
  'bitbucketAuth:cancelOAuth',
  'bitbucketAuth:clear'
] as const

function currentStatus(): BitbucketAuthCredentialStatus {
  const oauthAvailable = isBitbucketOAuthAvailable()
  const fromEnv = getBitbucketEnvironmentAuthStatus()
  if (fromEnv.configured) {
    return {
      configured: true,
      method: fromEnv.method,
      email: fromEnv.email,
      account: fromEnv.account,
      fromEnvironment: true,
      oauthAvailable
    }
  }
  return { ...getStoredBitbucketCredentialStatus(), oauthAvailable }
}

export function registerBitbucketAuthHandlers(): void {
  for (const channel of BITBUCKET_AUTH_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('bitbucketAuth:status', async (): Promise<BitbucketAuthCredentialStatus> => {
    return currentStatus()
  })

  ipcMain.handle(
    'bitbucketAuth:beginOAuth',
    async (): Promise<{ ok: true; account: string | null } | { error: string }> => {
      try {
        const tokens = await beginBitbucketOAuthLogin()
        setStoredBitbucketCredential({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt
        })
        _resetPreflightCache()
        const live = await getBitbucketAuthStatus()
        if (live.account) {
          setStoredBitbucketCredential({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt,
            account: live.account
          })
        }
        return { ok: true, account: live.account }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle('bitbucketAuth:cancelOAuth', async (): Promise<{ ok: true }> => {
    cancelBitbucketOAuth()
    return { ok: true }
  })

  ipcMain.handle('bitbucketAuth:clear', async (): Promise<{ ok: true } | { error: string }> => {
    try {
      clearStoredBitbucketCredential()
      _resetPreflightCache()
      return { ok: true }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })
}
