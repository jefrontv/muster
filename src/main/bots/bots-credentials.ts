// Keys the bots server uses (Composio and the like), held the way the upstream desktop shell holds
// them: one safeStorage-encrypted file, handed to the server as env at launch. Values never cross IPC.
import { Buffer } from 'node:buffer'
import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { safeStorage } from 'electron'
import { getCanonicalUserDataPath } from '../persistence'
import { writeSecureFile } from '../../shared/secure-file'

export const COMPOSIO_API_KEY_ENV = 'COMPOSIO_API_KEY'

const FILE_NAME = 'muster-bots-credentials.enc'
// Only secrets: a settings var or a cloud token reported by the server must never be replayed.
const CREDENTIAL_ENV_NAME = /^(?!OMB_CLOUD_)[A-Z][A-Z0-9_]{1,62}_(KEY|TOKEN)$/

export class BotsCredentialStoreUnavailableError extends Error {
  constructor() {
    super('Secure storage is unavailable, so the key cannot be saved.')
    this.name = 'BotsCredentialStoreUnavailableError'
  }
}

function credentialPath(): string {
  return path.join(getCanonicalUserDataPath(), 'integration-secrets', FILE_NAME)
}

export function isBotsCredentialEnvName(name: string): boolean {
  return CREDENTIAL_ENV_NAME.test(name)
}

/** The stored keys as env; empty when nothing is saved or the keychain refuses the file. */
export function readBotsCredentialEnv(): Record<string, string> {
  let stored: Buffer
  try {
    stored = Buffer.from(readFileSync(credentialPath(), 'utf8'), 'base64')
  } catch {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(safeStorage.decryptString(stored))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          isBotsCredentialEnvName(entry[0]) && typeof entry[1] === 'string' && entry[1].length > 0
      )
    )
  } catch (error) {
    console.warn('[bots] stored keys could not be read:', error)
    return {}
  }
}

/** Merges updates in; an empty value removes that key. Unknown names are ignored. */
export function writeBotsCredentialEnv(updates: Record<string, string>): void {
  const next = readBotsCredentialEnv()
  let changed = false
  for (const [name, raw] of Object.entries(updates)) {
    if (!isBotsCredentialEnvName(name) || typeof raw !== 'string') {
      continue
    }
    const value = raw.trim()
    if (value ? next[name] === value : !(name in next)) {
      continue
    }
    if (value) {
      next[name] = value
    } else {
      delete next[name]
    }
    changed = true
  }
  if (!changed) {
    return
  }
  if (Object.keys(next).length === 0) {
    rmSync(credentialPath(), { force: true })
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new BotsCredentialStoreUnavailableError()
  }
  // Base64 because writeSecureFile takes text while safeStorage returns raw bytes.
  writeSecureFile(
    credentialPath(),
    safeStorage.encryptString(JSON.stringify(next)).toString('base64')
  )
}

/** The last four characters, so Settings can show which key is saved without holding it. */
export function botsCredentialHint(name: string): string | null {
  const value = readBotsCredentialEnv()[name]
  return value ? value.slice(-4) : null
}
