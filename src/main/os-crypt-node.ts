// Chromium OSCrypt decryption in pure Node, for processes without a live `safeStorage`.
//
// Electron's safeStorage on macOS is Chromium's OSCrypt: payload = 'v10' + AES-128-CBC(data),
// key = PBKDF2-SHA1(<keychain password>, 'saltysalt', 1003 iterations, 16 bytes), IV = 16 spaces.
// The keychain password lives in the login keychain as service '<app name> Safe Storage'
// ('muster Safe Storage' here — verified by decrypting a known site secret to its known value).
//
// DECRYPT ONLY by design: the MCP server never writes secrets, and refusing to encrypt keeps a
// single writer (the GUI's real safeStorage) for every stored credential.

import { execFileSync } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'

const KEYCHAIN_SERVICES = ['muster Safe Storage', 'Muster Safe Storage'] as const
const V10_PREFIX = 'v10'

let cachedKey: Buffer | null | undefined

function deriveKey(): Buffer | null {
  if (cachedKey !== undefined) {
    return cachedKey
  }
  if (process.platform !== 'darwin') {
    cachedKey = null
    return null
  }
  for (const service of KEYCHAIN_SERVICES) {
    try {
      const password = execFileSync(
        '/usr/bin/security',
        ['find-generic-password', '-ws', service],
        // A denied keychain ACL prompt must fail this call, not hang the server.
        { stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 }
      )
        .toString()
        .trim()
      if (password.length > 0) {
        cachedKey = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
        return cachedKey
      }
    } catch {
      // Item absent under this name; try the next spelling.
    }
  }
  cachedKey = null
  return null
}

export function isOsCryptDecryptAvailable(): boolean {
  return deriveKey() !== null
}

/** Throws when the payload is not OSCrypt v10 or the keychain key is unreachable. */
export function osCryptDecryptString(payload: Buffer): string {
  const key = deriveKey()
  if (!key) {
    throw new Error('OSCrypt key unavailable: no Safe Storage item in the login keychain.')
  }
  if (payload.subarray(0, 3).toString('utf8') !== V10_PREFIX) {
    throw new Error('Not an OSCrypt v10 payload.')
  }
  const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
  return Buffer.concat([decipher.update(payload.subarray(3)), decipher.final()]).toString('utf8')
}

/** Test seam: pbkdf2/AES math without a keychain. */
export function osCryptDecryptWithPassword(payload: Buffer, password: string): string {
  const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
  const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
  return Buffer.concat([decipher.update(payload.subarray(3)), decipher.final()]).toString('utf8')
}
