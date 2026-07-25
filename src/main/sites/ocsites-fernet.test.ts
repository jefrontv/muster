import { describe, expect, it } from 'vitest'
import { decryptFernetToken, FernetDecryptionError, parseFernetKey } from './ocsites-fernet'

// Fixtures produced by Python `cryptography.fernet.Fernet` — the exact library ocsites uses.
// If this decrypts them, the importer can read every stored ocsites password without Python.
const KEY = 'deFBrisvsvfl_7sdUuZ4AsUyuu9i15eynrs6n0OzkTo='
const ASCII_TOKEN =
  'gAAAAABqZIwIOsAsbh9qVU71P5HOOHpz-2cbG-YEGes2ab4iVQxW-M9mmprkmbufOBqtLBpnqb08kdRC2ZJDCoNd2eDY0cgL7BLrkbCiioh0VWXmsU5406U='
const UNICODE_TOKEN =
  'gAAAAABqZIwIa4qWYHGjCi_jU1M2IYAKgXIn_qlPJ_E5WKQNTT_RfQ6QY21kN4coWrXIbrJlLO0e9dnw-Y0q_uYNs9hznvL8Jb-Oa0qt-52pBswYN57n2yM='

describe('parseFernetKey', () => {
  it('accepts a 44-char urlsafe-base64 key', () => {
    const key = parseFernetKey(KEY)
    expect(key.signingKey).toHaveLength(16)
    expect(key.encryptionKey).toHaveLength(16)
  })

  it('tolerates the trailing newline a written key file carries', () => {
    expect(() => parseFernetKey(`${KEY}\n`)).not.toThrow()
  })

  it('rejects a key that does not decode to 32 bytes', () => {
    expect(() => parseFernetKey('c2hvcnQ=')).toThrow(FernetDecryptionError)
  })
})

describe('decryptFernetToken', () => {
  it('decrypts a token produced by python cryptography', () => {
    expect(decryptFernetToken(parseFernetKey(KEY), ASCII_TOKEN)).toBe(
      'correct horse battery staple'
    )
  })

  it('round-trips non-ascii payloads', () => {
    expect(decryptFernetToken(parseFernetKey(KEY), UNICODE_TOKEN)).toBe('pa55w0rd with unicode ✓')
  })

  it('ignores the embedded timestamp so old stored passwords still migrate', () => {
    // The fixture's timestamp is fixed in the past; decryption must not apply a TTL.
    expect(decryptFernetToken(parseFernetKey(KEY), ASCII_TOKEN)).toContain('horse')
  })

  it('rejects a token signed with a different key instead of returning garbage', () => {
    const otherKey = parseFernetKey('4wYRoTNQbxKQGRQ4gRNGLQ0IZ4vJHYBjWbPu4vXHRZk=')
    expect(() => decryptFernetToken(otherKey, ASCII_TOKEN)).toThrow(/HMAC mismatch/)
  })

  it('rejects a tampered ciphertext body', () => {
    const raw = Buffer.from(ASCII_TOKEN, 'base64url')
    raw[40] = raw[40]! ^ 0xff
    expect(() => decryptFernetToken(parseFernetKey(KEY), raw.toString('base64url'))).toThrow(
      /HMAC mismatch/
    )
  })

  it('rejects an unknown version byte', () => {
    const raw = Buffer.from(ASCII_TOKEN, 'base64url')
    raw[0] = 0x79
    expect(() => decryptFernetToken(parseFernetKey(KEY), raw.toString('base64url'))).toThrow(
      /Unsupported Fernet version/
    )
  })

  it('rejects a truncated token', () => {
    expect(() => decryptFernetToken(parseFernetKey(KEY), 'gAAAAA==')).toThrow(/too short/)
  })
})
