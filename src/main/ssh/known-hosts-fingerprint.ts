import { createHash } from 'node:crypto'

/** OpenSSH `SHA256:<base64>` fingerprint (padding stripped) of a raw host-key blob. */
export function fingerprintHostKey(hostKey: Buffer): string {
  return `SHA256:${createHash('sha256').update(hostKey).digest('base64').replace(/=+$/, '')}`
}

/** Algorithm name embedded in an SSH public-key blob (`uint32 length` + name), e.g. `ssh-ed25519`. */
export function readHostKeyAlgorithm(hostKey: Buffer): string | null {
  if (hostKey.length < 5) {
    return null
  }
  const nameLength = hostKey.readUInt32BE(0)
  if (nameLength < 1 || nameLength > 64 || hostKey.length < 4 + nameLength) {
    return null
  }
  const name = hostKey.toString('latin1', 4, 4 + nameLength)
  return /^[!-~]+$/.test(name) ? name : null
}

/** Hostnames are case-insensitive; known_hosts lookups compare the lowercased form. */
export function normalizeKnownHostsHostname(host: string): string {
  return host.trim().toLowerCase()
}

/**
 * Every host field spelling a known_hosts entry may legitimately use for this endpoint.
 * OpenSSH writes the bare name on port 22, but hand-maintained files often keep `[host]:22`.
 */
export function knownHostsLabels(host: string, port: number): string[] {
  const normalized = normalizeKnownHostsHostname(host)
  return port === 22 ? [normalized, `[${normalized}]:22`] : [`[${normalized}]:${port}`]
}
