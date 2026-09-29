// IPC for Bitbucket review auth: OAuth Connect in Settings → Integrations.
// Tokens never leave main on the read path. status reports identity only.

import { BrowserWindow, ipcMain } from 'electron'
import {
  clearStoredBitbucketCredential,
  getStoredBitbucketCredentialStatus,
  setStoredBitbucketCredential
} from '../bitbucket/credential-store'
import { getBitbucketAuthStatus, getBitbucketEnvironmentAuthStatus } from '../bitbucket/client'
import {
  dismissBitbucketAuthLoss,
  getPendingBitbucketAuthLoss,
  resetBitbucketAuthLoss,
  wireBitbucketAuthLoss
} from '../bitbucket/auth-loss'
import { isBitbucketOAuthAvailable } from '../bitbucket/oauth-config'
import { beginBitbucketOAuthLogin, cancelBitbucketOAuth } from '../bitbucket/oauth-flow'
import { _resetPreflightCache } from './preflight'
import type {
  BitbucketAuthCredentialStatus,
  BitbucketAuthLoss
} from '../../shared/bitbucket-auth-types'

const BITBUCKET_AUTH_CHANNELS = [
  'bitbucketAuth:status',
  'bitbucketAuth:beginOAuth',
  'bitbucketAuth:cancelOAuth',
  'bitbucketAuth:clear',
  'bitbucketAuth:pendingLoss',
  'bitbucketAuth:dismissLoss'
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

/** Every window, so a prompt dismissed in one closes in the others. */
function broadcastBitbucketAuthLoss(loss: BitbucketAuthLoss | null): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('bitbucketAuth:lossChanged', loss)
    }
  }
}

export function registerBitbucketAuthHandlers(): void {
  for (const channel of BITBUCKET_AUTH_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  // Env credentials outrank the saved one and the UI cannot edit them; without an OAuth consumer
  // Reconnect cannot work. Either way a prompt would be a dead end.
  wireBitbucketAuthLoss({
    shouldReport: () =>
      isBitbucketOAuthAvailable() && !getBitbucketEnvironmentAuthStatus().configured,
    onChange: broadcastBitbucketAuthLoss
  })

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
        resetBitbucketAuthLoss()
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
      resetBitbucketAuthLoss()
      _resetPreflightCache()
      return { ok: true }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('bitbucketAuth:pendingLoss', async (): Promise<BitbucketAuthLoss | null> => {
    return getPendingBitbucketAuthLoss()
  })

  ipcMain.handle('bitbucketAuth:dismissLoss', async (): Promise<{ ok: true }> => {
    dismissBitbucketAuthLoss()
    return { ok: true }
  })
}
