// One-shot Fernet decryption, used only by the ocsites importer to read the legacy
// ~/.config/ocsites/deploy_presets.json passwords before they are re-encrypted with safeStorage.
// Muster never writes Fernet; this module exists so the migration needs no Python.
//
// Fernet spec: a 32-byte urlsafe-base64 key splits into a 16-byte HMAC-SHA256 signing key and a
// 16-byte AES-128-CBC encryption key. The token is urlsafe-base64 of
// version(1) || timestamp(8, big-endian) || iv(16) || ciphertext(...) || hmac(32),
// where the HMAC covers everything before it.

import { createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_VERSION = 0x80
const SIGNING_KEY_BYTES = 16
const IV_BYTES = 16
const HMAC_BYTES = 32
const HEADER_BYTES = 1 + 8 + IV_BYTES

export class FernetDecryptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FernetDecryptionError'
  }
}

export type FernetKey = {
  signingKey: Buffer
  encryptionKey: Buffer
}

/** Parses the 44-char urlsafe-base64 key from ocsites' `secret.key`. */
export function parseFernetKey(rawKey: string): FernetKey {
  const key = Buffer.from(rawKey.trim(), 'base64url')
  if (key.length !== 32) {
    throw new FernetDecryptionError(`Fernet key must decode to 32 bytes, got ${key.length}`)
  }
  return {
    signingKey: key.subarray(0, SIGNING_KEY_BYTES),
    encryptionKey: key.subarray(SIGNING_KEY_BYTES)
  }
}

/**
 * Decrypts a Fernet token to UTF-8.
 *
 * TTL is intentionally not enforced: ocsites tokens have no expiry and the embedded timestamp is
 * only informational, so a years-old stored password must still decrypt during migration.
 */
export function decryptFernetToken(key: FernetKey, token: string): string {
  const raw = Buffer.from(token.trim(), 'base64url')
  if (raw.length < HEADER_BYTES + HMAC_BYTES) {
    throw new FernetDecryptionError('Fernet token is too short')
  }
  if (raw[0] !== TOKEN_VERSION) {
    throw new FernetDecryptionError(`Unsupported Fernet version 0x${raw[0]?.toString(16)}`)
  }

  const signed = raw.subarray(0, raw.length - HMAC_BYTES)
  const expectedHmac = raw.subarray(raw.length - HMAC_BYTES)
  const actualHmac = createHmac('sha256', key.signingKey).update(signed).digest()
  if (!timingSafeEqual(actualHmac, expectedHmac)) {
    throw new FernetDecryptionError('Fernet HMAC mismatch — wrong key or corrupted token')
  }

  const iv = raw.subarray(9, HEADER_BYTES)
  const ciphertext = signed.subarray(HEADER_BYTES)
  if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) {
    throw new FernetDecryptionError('Fernet ciphertext is not a whole number of AES blocks')
  }

  const decipher = createDecipheriv('aes-128-cbc', key.encryptionKey, iv)
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch (error) {
    throw new FernetDecryptionError(
      `Fernet payload did not decrypt: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
