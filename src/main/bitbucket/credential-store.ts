// Bitbucket review credential: the Atlassian API token (or raw access token) behind pull-request
// and build-status lookups.
//
// Why a separate file from sites/bitbucket-credential-store.ts: that one holds a workspace App
// Password used to *list repos before a site exists*. This one is hosted-review auth. They are
// issued, scoped, and revoked independently, so sharing a file would make revoking one silently
// break the other. Same posture though: one safeStorage-encrypted file, mode 0700 directory, and
// the secret is never returned across IPC.

import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import { safeStorage } from 'electron'
import { readStoredCredentialToken } from '../integration-credential-file'
import { getCanonicalUserDataPath } from '../persistence'
import { writeSecureFile } from '../../shared/secure-file'
import type {
  BitbucketAuthCredentialStatus,
  BitbucketAuthMethod
} from '../../shared/bitbucket-auth-types'

export class BitbucketSecretUnavailableError extends Error {
  constructor() {
    super('Secure storage is unavailable, so the Bitbucket credential cannot be saved.')
    this.name = 'BitbucketSecretUnavailableError'
  }
}

export type BitbucketCredentialRecord = {
  email: string
  apiToken: string
  accessToken: string
  refreshToken: string
  expiresAt: number
  account: string
}

const FILE_NAME = 'bitbucket-review-credential.enc'

const EMPTY: BitbucketCredentialRecord = {
  email: '',
  apiToken: '',
  accessToken: '',
  refreshToken: '',
  expiresAt: 0,
  account: ''
}

function credentialPath(): string {
  return path.join(getCanonicalUserDataPath(), 'integration-secrets', FILE_NAME)
}

function readRecord(): BitbucketCredentialRecord | null {
  let stored: Buffer
  try {
    stored = Buffer.from(readFileSync(credentialPath(), 'utf8'), 'base64')
  } catch {
    return null
  }
  const decrypted = readStoredCredentialToken('Bitbucket', stored)
  if (decrypted === null) {
    return null
  }
  try {
    const parsed = JSON.parse(decrypted) as Partial<BitbucketCredentialRecord>
    return {
      email: typeof parsed.email === 'string' ? parsed.email : '',
      apiToken: typeof parsed.apiToken === 'string' ? parsed.apiToken : '',
      accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : '',
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
      expiresAt:
        typeof parsed.expiresAt === 'number' && Number.isFinite(parsed.expiresAt)
          ? parsed.expiresAt
          : 0,
      account: typeof parsed.account === 'string' ? parsed.account : ''
    }
  } catch {
    return null
  }
}

function hasSecret(record: BitbucketCredentialRecord): boolean {
  return (
    record.accessToken.length > 0 ||
    record.refreshToken.length > 0 ||
    (record.email.length > 0 && record.apiToken.length > 0)
  )
}

function writeRecord(record: BitbucketCredentialRecord): void {
  const target = credentialPath()
  if (!hasSecret(record)) {
    rmSync(target, { force: true })
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new BitbucketSecretUnavailableError()
  }
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  // Base64 because writeSecureFile takes text while safeStorage returns raw bytes.
  writeSecureFile(target, safeStorage.encryptString(JSON.stringify(record)).toString('base64'))
}

function methodOf(record: BitbucketCredentialRecord): BitbucketAuthMethod | null {
  if (record.refreshToken.length > 0) {
    return 'oauth'
  }
  if (record.accessToken.length > 0) {
    return 'access-token'
  }
  return record.email.length > 0 && record.apiToken.length > 0 ? 'api-token' : null
}

/** Stored credential, or null when nothing usable is saved. */
export function getStoredBitbucketCredential(): BitbucketCredentialRecord | null {
  const record = readRecord()
  return record && hasSecret(record) ? record : null
}

export function getStoredBitbucketCredentialStatus(): BitbucketAuthCredentialStatus {
  const record = getStoredBitbucketCredential()
  if (!record) {
    return {
      configured: false,
      method: null,
      email: null,
      account: null,
      fromEnvironment: false,
      oauthAvailable: true
    }
  }
  return {
    configured: true,
    method: methodOf(record),
    email: record.email.length > 0 ? record.email : null,
    account: record.account.length > 0 ? record.account : null,
    fromEnvironment: false,
    oauthAvailable: true
  }
}

/**
 * Whole-record replace, not a merge: the form always submits one complete auth method, and merging
 * would let a leftover access token from a previous save silently outrank a newly entered
 * email/API-token pair (authHeaders prefers the bearer token).
 */
export function setStoredBitbucketCredential(input: Partial<BitbucketCredentialRecord>): void {
  writeRecord({
    email: input.email?.trim() ?? '',
    apiToken: input.apiToken?.trim() ?? '',
    accessToken: input.accessToken?.trim() ?? '',
    refreshToken: input.refreshToken?.trim() ?? '',
    expiresAt:
      typeof input.expiresAt === 'number' && Number.isFinite(input.expiresAt) ? input.expiresAt : 0,
    account: input.account?.trim() ?? ''
  })
}

export function clearStoredBitbucketCredential(): void {
  writeRecord(EMPTY)
}
