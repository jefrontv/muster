// Per-secret storage for site SSH and DB passwords.
//
// One file per (site, environment, kind) under <userData>/site-secrets/, encrypted with Electron
// safeStorage (OS keychain-backed). This replaces ocsites' Fernet key + a single 264 KB
// deploy_presets.json holding every password.
//
// Deliberately NOT stored in orca-data.json: that blob has a hand-maintained encrypt allowlist
// (persistence.ts), so a missed field ships cleartext, and hundreds of secrets would bloat every
// debounced save. Deliberately NOT falling back to plaintext when safeStorage is unavailable
// (unlike Linear/Jira): a DB or SSH password is worth more than an API token.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { safeStorage } from 'electron'
import {
  CredentialDecryptionError,
  readStoredCredentialToken
} from '../integration-credential-file'
import { getCanonicalUserDataPath } from '../persistence'
import { writeSecureFile } from '../../shared/secure-file'
import type { SiteSecretKind, SiteSecretPresence } from '../../shared/site-types'

export class SiteSecretUnavailableError extends Error {
  constructor() {
    super(
      'OS encryption is unavailable, so site passwords cannot be stored. ' +
        'On Linux this usually means no keyring (gnome-keyring / kwallet) is running.'
    )
    this.name = 'SiteSecretUnavailableError'
  }
}

export function getSiteSecretsDirectory(): string {
  return path.join(getCanonicalUserDataPath(), 'site-secrets')
}

// Why: environment names are user-supplied and may contain path separators; base64url of the
// composite key keeps one flat directory and makes the filename reversible for diagnostics.
function secretFileName(siteId: string, environment: string, kind: SiteSecretKind): string {
  return `${Buffer.from(`${siteId}:${environment}:${kind}`, 'utf8').toString('base64url')}.enc`
}

function secretPath(siteId: string, environment: string, kind: SiteSecretKind): string {
  return path.join(getSiteSecretsDirectory(), secretFileName(siteId, environment, kind))
}

export function setSiteSecret(
  siteId: string,
  environment: string,
  kind: SiteSecretKind,
  value: string
): void {
  const target = secretPath(siteId, environment, kind)
  if (value.length === 0) {
    rmSync(target, { force: true })
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new SiteSecretUnavailableError()
  }
  mkdirSync(getSiteSecretsDirectory(), { recursive: true, mode: 0o700 })
  // Base64 because writeSecureFile takes text and safeStorage returns raw bytes.
  writeSecureFile(target, safeStorage.encryptString(value).toString('base64'))
}

/** Returns null when no secret is stored; throws CredentialDecryptionError when it cannot be read. */
export function getSiteSecret(
  siteId: string,
  environment: string,
  kind: SiteSecretKind
): string | null {
  const target = secretPath(siteId, environment, kind)
  let stored: Buffer
  try {
    stored = Buffer.from(readFileSync(target, 'utf8'), 'base64')
  } catch {
    return null
  }
  return readStoredCredentialToken('Site', stored)
}

export function hasSiteSecret(siteId: string, environment: string, kind: SiteSecretKind): boolean {
  return existsSync(secretPath(siteId, environment, kind))
}

export function getSiteSecretPresence(siteId: string, environment: string): SiteSecretPresence {
  return {
    ssh: hasSiteSecret(siteId, environment, 'ssh'),
    db: hasSiteSecret(siteId, environment, 'db')
  }
}

/** Drops every secret for a site (all environments, all kinds) — used when a site is removed. */
export function deleteSiteSecrets(siteId: string): void {
  const directory = getSiteSecretsDirectory()
  let entries: string[]
  try {
    entries = readdirSync(directory)
  } catch {
    return
  }
  const prefix = `${siteId}:`
  for (const entry of entries) {
    if (!entry.endsWith('.enc')) {
      continue
    }
    const decoded = Buffer.from(entry.slice(0, -'.enc'.length), 'base64url').toString('utf8')
    if (decoded.startsWith(prefix)) {
      rmSync(path.join(directory, entry), { force: true })
    }
  }
}

/**
 * Re-encrypts a whole environment's secrets under a new environment name. Secret files are keyed
 * on the environment, so every rename or duplicate must carry them across or the next run fails
 * on a missing credential that the user believes is still stored.
 */
export function copySiteEnvironmentSecrets(siteId: string, from: string, to: string): void {
  if (from === to) {
    return
  }
  for (const kind of ['ssh', 'db'] as const) {
    const value = getSiteSecret(siteId, from, kind)
    if (value !== null) {
      setSiteSecret(siteId, to, kind, value)
    }
  }
}

export function deleteSiteEnvironmentSecrets(siteId: string, environment: string): void {
  for (const kind of ['ssh', 'db'] as const) {
    rmSync(secretPath(siteId, environment, kind), { force: true })
  }
}

export { CredentialDecryptionError }
