import { generateKeyPairSync, sign, verify } from 'node:crypto'

// Mirrors ssh2's DEFAULT_SERVER_HOST_KEY; ssh2 throws on any name outside its supported set.
const ED25519_ALGORITHM = 'ssh-ed25519'
const NON_EDDSA_DEFAULTS: readonly string[] = [
  'ecdsa-sha2-nistp256',
  'ecdsa-sha2-nistp384',
  'ecdsa-sha2-nistp521',
  'rsa-sha2-512',
  'rsa-sha2-256',
  'ssh-rsa'
]

// known_hosts records every RSA host key as `ssh-rsa`; ssh2 negotiates the RFC 8332
// signature variants for that same key, so a pinned `ssh-rsa` must map to all three.
const NEGOTIATION_NAMES: Record<string, readonly string[]> = {
  'ssh-rsa': ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa']
}

let cachedDefaults: readonly string[] | null = null

/** ssh2 drops ed25519 when the runtime cannot sign with it, and rejects lists that still name it. */
export function ssh2DefaultServerHostKeyAlgorithms(): readonly string[] {
  if (!cachedDefaults) {
    cachedDefaults = isEd25519Usable()
      ? [ED25519_ALGORITHM, ...NON_EDDSA_DEFAULTS]
      : NON_EDDSA_DEFAULTS
  }
  return cachedDefaults
}

/**
 * OpenSSH reorders HostKeyAlgorithms so a server offers a key type the client already trusts.
 * Without the same ordering ssh2 can negotiate a type this host was never pinned with, which
 * would look identical to a key substitution. Returns null when the default order already matches.
 */
export function orderServerHostKeyAlgorithms(trustedKeyTypes: readonly string[]): string[] | null {
  const defaults = ssh2DefaultServerHostKeyAlgorithms()
  const preferred: string[] = []
  for (const keyType of trustedKeyTypes) {
    for (const name of NEGOTIATION_NAMES[keyType] ?? [keyType]) {
      if (defaults.includes(name) && !preferred.includes(name)) {
        preferred.push(name)
      }
    }
  }
  if (preferred.length === 0) {
    return null
  }
  const ordered = [...preferred, ...defaults.filter((name) => !preferred.includes(name))]
  return ordered.every((name, index) => name === defaults[index]) ? null : ordered
}

function isEd25519Usable(): boolean {
  try {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const data = Buffer.from('orca-host-key-probe')
    return verify(null, data, publicKey, sign(null, data, privateKey))
  } catch {
    return false
  }
}
