import { createHmac, timingSafeEqual } from 'node:crypto'
import { fingerprintHostKey, readHostKeyAlgorithm } from './known-hosts-fingerprint'

export type KnownHostsMarker = 'cert-authority' | 'revoked'

export type KnownHostsHostHash = {
  salt: Buffer
  hash: Buffer
}

export type KnownHostsEntry = {
  marker: KnownHostsMarker | null
  /** Literal/wildcard host patterns; empty when the line uses a hashed host field. */
  patterns: readonly string[]
  /** `|1|salt|hash` HMAC-SHA1 host hash, when the line is hashed. */
  hashed: KnownHostsHostHash | null
  keyType: string
  fingerprint: string
}

export type KnownHostsParseResult = {
  entries: KnownHostsEntry[]
  /** Lines we could not decode (unknown hash type, corrupt key). Treated as if absent. */
  skippedLines: number
}

const HASHED_HOST_PREFIX = '|1|'
const BASE64_PATTERN = /^[A-Za-z\d+/]+={0,2}$/
const HMAC_SHA1_DIGEST_BYTES = 20

export function parseKnownHosts(content: string): KnownHostsParseResult {
  const entries: KnownHostsEntry[] = []
  let skippedLines = 0
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#')) {
      continue
    }
    const entry = parseKnownHostsLine(line)
    if (entry === null) {
      skippedLines += 1
      continue
    }
    entries.push(entry)
  }
  return { entries, skippedLines }
}

/** True when any host spelling in `hostLabels` is covered by this entry. */
export function knownHostsEntryMatchesHost(
  entry: KnownHostsEntry,
  hostLabels: readonly string[]
): boolean {
  const hashed = entry.hashed
  if (hashed) {
    return hostLabels.some((label) => hashedHostMatches(hashed, label))
  }
  let matched = false
  for (const pattern of entry.patterns) {
    const negated = pattern.startsWith('!')
    const candidate = negated ? pattern.slice(1) : pattern
    if (!hostLabels.some((label) => matchesHostPattern(candidate, label))) {
      continue
    }
    // A negated pattern vetoes the whole entry, even if a positive pattern also matched.
    if (negated) {
      return false
    }
    matched = true
  }
  return matched
}

function parseKnownHostsLine(line: string): KnownHostsEntry | null {
  const fields = line.split(/\s+/)
  let marker: KnownHostsMarker | null = null
  if (fields[0]?.startsWith('@')) {
    const token = fields.shift()
    if (token === '@cert-authority') {
      marker = 'cert-authority'
    } else if (token === '@revoked') {
      marker = 'revoked'
    } else {
      return null
    }
  }

  const [hostField, keyType, encodedKey] = fields
  if (!hostField || !keyType || !encodedKey || !BASE64_PATTERN.test(encodedKey)) {
    return null
  }
  const blob = Buffer.from(encodedKey, 'base64')
  // Why: base64 decoding is lenient, so validate the payload by its self-described algorithm.
  if (readHostKeyAlgorithm(blob) !== keyType) {
    return null
  }

  const hashed = parseHashedHost(hostField)
  if (hashed === 'unsupported') {
    return null
  }
  return {
    marker,
    patterns: hashed ? [] : hostField.split(',').filter((pattern) => pattern.length > 0),
    hashed,
    keyType,
    fingerprint: fingerprintHostKey(blob)
  }
}

function parseHashedHost(hostField: string): KnownHostsHostHash | null | 'unsupported' {
  if (!hostField.startsWith('|')) {
    return null
  }
  if (!hostField.startsWith(HASHED_HOST_PREFIX)) {
    return 'unsupported'
  }
  const parts = hostField.slice(HASHED_HOST_PREFIX.length).split('|')
  const [encodedSalt, encodedHash] = parts
  if (
    parts.length !== 2 ||
    !encodedSalt ||
    !encodedHash ||
    !BASE64_PATTERN.test(encodedSalt) ||
    !BASE64_PATTERN.test(encodedHash)
  ) {
    return 'unsupported'
  }
  const salt = Buffer.from(encodedSalt, 'base64')
  const hash = Buffer.from(encodedHash, 'base64')
  if (salt.length === 0 || hash.length !== HMAC_SHA1_DIGEST_BYTES) {
    return 'unsupported'
  }
  return { salt, hash }
}

function hashedHostMatches(hashed: KnownHostsHostHash, label: string): boolean {
  const digest = createHmac('sha1', hashed.salt).update(label).digest()
  return digest.length === hashed.hash.length && timingSafeEqual(digest, hashed.hash)
}

function matchesHostPattern(pattern: string, label: string): boolean {
  if (!pattern.includes('*') && !pattern.includes('?')) {
    return pattern.toLowerCase() === label.toLowerCase()
  }
  const expression = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${expression}$`, 'i').test(label)
}
