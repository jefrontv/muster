// Encrypted at-rest storage for credentials Muster hands to a bundled extension.
//
// The master copy is encrypted with Electron safeStorage (OS keychain-backed). It is decrypted
// only to regenerate an installed extension's config.js, which is necessarily readable by that
// extension — the same exposure chrome.storage would give it, but nothing is left in cleartext
// in the persisted app state blob.

import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import * as electron from 'electron'
import { getCanonicalUserDataPath } from '../persistence'
import { writeSecureFile } from '../../shared/secure-file'

function getSecretPath(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, '_')
  return path.join(getCanonicalUserDataPath(), 'extension-secrets', `${safeKey}.enc`)
}

export class ExtensionSecretUnavailableError extends Error {
  constructor() {
    super(
      'OS encryption is unavailable, so extension credentials cannot be stored. ' +
        'On Linux this usually means no keyring (gnome-keyring / kwallet) is running.'
    )
    this.name = 'ExtensionSecretUnavailableError'
  }
}

export function hasExtensionSecret(key: string): boolean {
  return existsSync(getSecretPath(key))
}

export function writeExtensionSecret(key: string, secret: string): void {
  if (!secret) {
    clearExtensionSecret(key)
    return
  }
  // Why: refuse rather than fall back to plaintext — a WordPress admin password is worth more
  // than the convenience, matching site-secret-store's stance on DB/SSH passwords.
  if (!electron.safeStorage.isEncryptionAvailable()) {
    throw new ExtensionSecretUnavailableError()
  }
  writeSecureFile(getSecretPath(key), electron.safeStorage.encryptString(secret).toString('base64'))
}

export function readExtensionSecret(key: string): string | null {
  const secretPath = getSecretPath(key)
  if (!existsSync(secretPath) || !electron.safeStorage.isEncryptionAvailable()) {
    return null
  }
  try {
    const raw = Buffer.from(readFileSync(secretPath, 'utf8'), 'base64')
    const decrypted = electron.safeStorage.decryptString(raw)
    return decrypted.length > 0 ? decrypted : null
  } catch {
    // A keychain the OS will not unlock reads as "no credential" rather than crashing setup.
    return null
  }
}

export function clearExtensionSecret(key: string): void {
  try {
    rmSync(getSecretPath(key), { force: true })
  } catch {
    // Best effort: a missing or locked file leaves nothing usable behind either way.
  }
}
