// The ActiveCollab API token plus the identity it resolves to.
//
// One record, not a keyed map: an ActiveCollab token addresses exactly one instance and one user,
// so there is no multi-site fan-out to model (unlike Jira). Same posture as the other integration
// stores — a single safeStorage-encrypted file under integration-secrets/, mode 0700 directory,
// and the token itself never crosses IPC. Only the connection metadata does.
//
// The identity is cached alongside the token because every task read needs `users/{id}/tasks`, and
// re-resolving it would cost a request on every poll.

import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import { safeStorage } from 'electron'
import {
  CredentialDecryptionError,
  readStoredCredentialToken
} from '../integration-credential-file'
import { getCanonicalUserDataPath } from '../persistence'
import { writeSecureFile } from '../../shared/secure-file'
import type {
  ActiveCollabConnection,
  ActiveCollabConnectionStatus
} from '../../shared/activecollab-types'

export class ActiveCollabSecretUnavailableError extends Error {
  constructor() {
    super('Secure storage is unavailable, so the ActiveCollab credential cannot be saved.')
    this.name = 'ActiveCollabSecretUnavailableError'
  }
}

export type ActiveCollabCredentialRecord = ActiveCollabConnection & { token: string }

const FILE_NAME = 'activecollab-credential.enc'

const NOT_CONFIGURED_REASON =
  'ActiveCollab is not connected. Add your instance URL and sign in to connect.'

const UNREADABLE_REASON = 'ActiveCollab credential could not be read.'

function credentialPath(): string {
  return path.join(getCanonicalUserDataPath(), 'integration-secrets', FILE_NAME)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readId(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0
}

/**
 * Trailing slashes are stripped once, here, so every permalink join stays
 * `${instanceUrl}${urlPath}` and two spellings of the same instance never look like two accounts.
 */
export function normaliseActiveCollabInstanceUrl(value: unknown): string {
  return readString(value).replace(/\/+$/, '')
}

/** A record missing any of these cannot address the API, so it is indistinguishable from absent. */
function isUsable(record: ActiveCollabCredentialRecord): boolean {
  return record.instanceUrl.length > 0 && record.token.length > 0 && record.userId > 0
}

function parseRecord(decrypted: string): ActiveCollabCredentialRecord | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(decrypted)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }
  const raw = parsed as Record<string, unknown>
  const record: ActiveCollabCredentialRecord = {
    instanceUrl: normaliseActiveCollabInstanceUrl(raw.instanceUrl),
    token: readString(raw.token),
    userId: readId(raw.userId),
    userName: readString(raw.userName),
    userEmail: readString(raw.userEmail)
  }
  return isUsable(record) ? record : null
}

/**
 * The stored credential, or null when nothing usable is saved.
 *
 * Throws CredentialDecryptionError when ciphertext exists but the keychain refuses it, so callers
 * that need the token surface the reconnect banner instead of a misleading "not connected".
 */
export function getActiveCollabCredential(): ActiveCollabCredentialRecord | null {
  let stored: Buffer
  try {
    stored = Buffer.from(readFileSync(credentialPath(), 'utf8'), 'base64')
  } catch {
    return null
  }
  const decrypted = readStoredCredentialToken('ActiveCollab', stored)
  return decrypted === null ? null : parseRecord(decrypted)
}

/**
 * Whole-record replace, not a merge: the token, the instance it addresses, and the identity it
 * resolves to are issued together. Merging would let a previous account's userId outlive a
 * reconnect and silently point task reads at the wrong person.
 */
export function setActiveCollabCredential(record: ActiveCollabCredentialRecord): void {
  const normalised: ActiveCollabCredentialRecord = {
    instanceUrl: normaliseActiveCollabInstanceUrl(record.instanceUrl),
    token: readString(record.token),
    userId: readId(record.userId),
    userName: readString(record.userName),
    userEmail: readString(record.userEmail)
  }
  const target = credentialPath()
  if (!isUsable(normalised)) {
    rmSync(target, { force: true })
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new ActiveCollabSecretUnavailableError()
  }
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  // Base64 because writeSecureFile takes text while safeStorage returns raw bytes.
  writeSecureFile(target, safeStorage.encryptString(JSON.stringify(normalised)).toString('base64'))
}

export function clearActiveCollabCredential(): void {
  rmSync(credentialPath(), { force: true })
}

/**
 * Never throws: "not connected" and "cannot decrypt" are both states the settings pane renders,
 * and a keychain refusal must not take down whatever is asking whether the integration is on.
 */
export function getActiveCollabConnectionStatus(): ActiveCollabConnectionStatus {
  let record: ActiveCollabCredentialRecord | null
  try {
    record = getActiveCollabCredential()
  } catch (error) {
    const reason = error instanceof CredentialDecryptionError ? error.message : UNREADABLE_REASON
    return { configured: false, connection: null, reason }
  }
  if (!record) {
    return { configured: false, connection: null, reason: NOT_CONFIGURED_REASON }
  }
  return {
    configured: true,
    connection: {
      instanceUrl: record.instanceUrl,
      userId: record.userId,
      userName: record.userName,
      userEmail: record.userEmail
    },
    reason: ''
  }
}
