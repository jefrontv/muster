// IPC for the Bitbucket review credential entered in Settings → Integrations.
//
// The secret only travels inbound. `status` returns whether something is stored and which identity
// it belongs to, never the token itself, so a compromised renderer cannot read it back out.

import { ipcMain } from 'electron'
import {
  clearStoredBitbucketCredential,
  getStoredBitbucketCredentialStatus,
  setStoredBitbucketCredential
} from '../bitbucket/credential-store'
import { getBitbucketEnvironmentAuthStatus } from '../bitbucket/client'
import { _resetPreflightCache } from './preflight'
import type {
  BitbucketAuthCredentialInput,
  BitbucketAuthCredentialStatus
} from '../../shared/bitbucket-auth-types'

const BITBUCKET_AUTH_CHANNELS = [
  'bitbucketAuth:status',
  'bitbucketAuth:setCredentials',
  'bitbucketAuth:clear'
] as const

// Bitbucket caps API tokens well below this; the bound just stops a hostile renderer from
// streaming megabytes into the keychain file.
const MAX_SECRET_LENGTH = 4_096
const MAX_EMAIL_LENGTH = 320

function readField(value: unknown, max: number): string {
  if (typeof value !== 'string') {
    return ''
  }
  const trimmed = value.trim()
  if (trimmed.length > max) {
    throw new Error(`Value exceeds ${max} characters.`)
  }
  return trimmed
}

function readInput(args: unknown): BitbucketAuthCredentialInput {
  const input = (args ?? {}) as Record<string, unknown>
  return {
    email: readField(input.email, MAX_EMAIL_LENGTH),
    apiToken: readField(input.apiToken, MAX_SECRET_LENGTH),
    accessToken: readField(input.accessToken, MAX_SECRET_LENGTH)
  }
}

function currentStatus(): BitbucketAuthCredentialStatus {
  // Environment variables win in getAuthConfig, so surface that: the form must not imply it can
  // edit a credential the process was launched with.
  const fromEnv = getBitbucketEnvironmentAuthStatus()
  if (fromEnv.configured) {
    return {
      configured: true,
      method: fromEnv.method,
      email: fromEnv.email,
      fromEnvironment: true
    }
  }
  return getStoredBitbucketCredentialStatus()
}

export function registerBitbucketAuthHandlers(): void {
  for (const channel of BITBUCKET_AUTH_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('bitbucketAuth:status', async (): Promise<BitbucketAuthCredentialStatus> => {
    return currentStatus()
  })

  ipcMain.handle(
    'bitbucketAuth:setCredentials',
    async (_event, args: unknown): Promise<{ ok: true } | { error: string }> => {
      try {
        const input = readInput(args)
        const hasPair = Boolean(input.email && input.apiToken)
        if (!hasPair && !input.accessToken) {
          return { error: 'Enter an email and API token, or an access token.' }
        }
        setStoredBitbucketCredential(input)
        // The preflight result is process-cached, so the card would keep reporting the old state.
        _resetPreflightCache()
        return { ok: true }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

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
