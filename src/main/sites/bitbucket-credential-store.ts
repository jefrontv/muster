// The stored Bitbucket App Password (or Atlassian API token) that backs workspace repo listing.
//
// Why a separate store rather than site-secret-store.ts: that store is keyed on
// (siteId, environment, kind) and a workspace credential belongs to no site — it is what you use
// *before* a site exists. Same posture though: one safeStorage-encrypted file, never plaintext,
// and the secret is never returned across IPC (only `configured` + the username).
//
// Initial credential source is the legacy ocsites config, whose importer already recovers
// bitbucket_username / bitbucket_api_key (ocsites-config-import.ts:86-88). Seeding runs at most
// once per process, only when nothing is stored yet.

import { readFileSync, mkdirSync, rmSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import { safeStorage } from 'electron'
import { readStoredCredentialToken } from '../integration-credential-file'
import { getCanonicalUserDataPath } from '../persistence'
import { writeSecureFile } from '../../shared/secure-file'
import type { BitbucketCredentialStatus } from '../../shared/site-bind-types'
import type { BitbucketCredentials } from './bitbucket-workspace-repos'
import { importOcsitesConfig } from './ocsites-config-import'
import { SiteSecretUnavailableError } from './site-secret-store'

export type BitbucketCredentialRecord = {
  username: string
  appPassword: string
  workspace: string
}

const FILE_NAME = 'bitbucket-credential.enc'

let seedAttempted = false

function credentialPath(): string {
  return path.join(getCanonicalUserDataPath(), 'site-secrets', FILE_NAME)
}

function readRecord(): BitbucketCredentialRecord | null {
  let stored: Buffer
  try {
    stored = Buffer.from(readFileSync(credentialPath(), 'utf8'), 'base64')
  } catch {
    return null
  }
  const decrypted = readStoredCredentialToken('Site', stored)
  if (decrypted === null) {
    return null
  }
  try {
    const parsed = JSON.parse(decrypted) as Partial<BitbucketCredentialRecord>
    return {
      username: typeof parsed.username === 'string' ? parsed.username : '',
      appPassword: typeof parsed.appPassword === 'string' ? parsed.appPassword : '',
      workspace: typeof parsed.workspace === 'string' ? parsed.workspace : ''
    }
  } catch {
    return null
  }
}

function writeRecord(record: BitbucketCredentialRecord): void {
  const target = credentialPath()
  if (record.username.length === 0 && record.appPassword.length === 0) {
    rmSync(target, { force: true })
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new SiteSecretUnavailableError()
  }
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  // Base64 because writeSecureFile takes text while safeStorage returns raw bytes.
  writeSecureFile(target, safeStorage.encryptString(JSON.stringify(record)).toString('base64'))
}

/** Best-effort one-shot migration; a missing or unreadable ocsites config is simply "no credential". */
function seedFromOcsites(): BitbucketCredentialRecord | null {
  seedAttempted = true
  let legacy: BitbucketCredentialRecord | null = null
  try {
    const global = importOcsitesConfig().global
    if (global && global.bitbucketUsername && global.bitbucketAppPassword) {
      legacy = {
        username: global.bitbucketUsername,
        appPassword: global.bitbucketAppPassword,
        workspace: global.bitbucketWorkspace
      }
    }
  } catch {
    return null
  }
  if (!legacy) {
    return null
  }
  try {
    writeRecord(legacy)
  } catch {
    // No keychain: still usable for this process, just not persisted.
  }
  return legacy
}

export function getBitbucketCredentialRecord(): BitbucketCredentialRecord | null {
  const stored = readRecord()
  if (stored) {
    return stored
  }
  return seedAttempted ? null : seedFromOcsites()
}

export function getBitbucketCredentials(): BitbucketCredentials | null {
  const record = getBitbucketCredentialRecord()
  if (!record || record.username.length === 0 || record.appPassword.length === 0) {
    return null
  }
  return { username: record.username, appPassword: record.appPassword }
}

export function getBitbucketCredentialStatus(): BitbucketCredentialStatus {
  const record = getBitbucketCredentialRecord()
  return {
    configured: Boolean(record && record.username && record.appPassword),
    username: record?.username ?? '',
    workspace: record?.workspace ?? ''
  }
}

/**
 * Partial update: an omitted field keeps its stored value, so the settings pane can change the
 * workspace without the user re-entering the App Password.
 */
export function setBitbucketCredentials(update: Partial<BitbucketCredentialRecord>): void {
  const current = getBitbucketCredentialRecord() ?? { username: '', appPassword: '', workspace: '' }
  writeRecord({
    username: update.username ?? current.username,
    appPassword: update.appPassword ?? current.appPassword,
    workspace: update.workspace ?? current.workspace
  })
}

export function clearBitbucketCredentials(): void {
  rmSync(credentialPath(), { force: true })
}
