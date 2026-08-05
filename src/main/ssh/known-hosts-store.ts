import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  fingerprintHostKey,
  knownHostsLabels,
  normalizeKnownHostsHostname,
  readHostKeyAlgorithm
} from './known-hosts-fingerprint'
import {
  knownHostsEntryMatchesHost,
  parseKnownHosts,
  type KnownHostsEntry
} from './known-hosts-parse'
import type { PresentedHostKey, TrustedHostKey } from './known-hosts-error'

export type SshHostKeyVerdict = {
  outcome: 'trusted' | 'pinned' | 'mismatch' | 'revoked'
  presented: PresentedHostKey
  trusted: TrustedHostKey[]
}

export type SshKnownHostsStoreOptions = {
  /** Muster's own pins. `null` keeps pins in memory only (no userData bound yet). */
  pinFilePath?: string | null
  /** OpenSSH known_hosts files, read-only. Never written to. */
  userKnownHostsPaths?: readonly string[]
}

type PinRecord = {
  keyType: string
  fingerprint: string
  pinnedAt: string
}

type CachedKnownHosts = {
  mtimeMs: number
  size: number
  entries: KnownHostsEntry[]
  skippedLines: number
}

const PIN_FILE_VERSION = 1
const UNKNOWN_KEY_TYPE = 'unknown'

/**
 * Trust-on-first-use host key pinning. ssh2 accepts any host key by default, so without this
 * Muster would hand stored passwords to whoever answers on the wire.
 */
export class SshKnownHostsStore {
  private readonly pinFilePath: string | null
  private readonly userKnownHostsPaths: readonly string[]
  private pins: Map<string, PinRecord[]> | null = null
  private readonly knownHostsCache = new Map<string, CachedKnownHosts>()
  private skippedKnownHostsLines = 0

  constructor(options: SshKnownHostsStoreOptions = {}) {
    this.pinFilePath = options.pinFilePath ?? null
    this.userKnownHostsPaths = options.userKnownHostsPaths ?? []
  }

  getPinFilePath(): string | null {
    return this.pinFilePath
  }

  /** known_hosts lines we could not decode on the last read; they are treated as absent. */
  getSkippedKnownHostsLines(): number {
    return this.skippedKnownHostsLines
  }

  /** Key types already trusted for this endpoint, used to bias ssh2's algorithm negotiation. */
  getTrustedKeyTypes(host: string, port: number): string[] {
    const seen = new Set<string>()
    for (const key of this.listTrusted(host, port)) {
      if (key.keyType !== UNKNOWN_KEY_TYPE) {
        seen.add(key.keyType)
      }
    }
    return [...seen]
  }

  listTrusted(host: string, port: number): TrustedHostKey[] {
    const trusted: TrustedHostKey[] = []
    for (const record of this.loadPins().get(pinKey(host, port)) ?? []) {
      trusted.push({
        keyType: record.keyType,
        fingerprint: record.fingerprint,
        source: 'muster-pin'
      })
    }
    for (const entry of this.matchingKnownHostsEntries(host, port)) {
      if (entry.marker === null) {
        trusted.push({
          keyType: entry.keyType,
          fingerprint: entry.fingerprint,
          source: 'user-known-hosts'
        })
      }
    }
    return trusted
  }

  /**
   * Never throws: it runs inside ssh2's `hostVerifier`, where a throw would surface as an
   * opaque protocol error instead of a refusal.
   */
  verify(host: string, port: number, hostKey: Buffer): SshHostKeyVerdict {
    const presented: PresentedHostKey = {
      keyType: readHostKeyAlgorithm(hostKey) ?? UNKNOWN_KEY_TYPE,
      fingerprint: fingerprintHostKey(hostKey)
    }
    const trusted = this.listTrusted(host, port)

    const revoked = this.matchingKnownHostsEntries(host, port).some(
      (entry) => entry.marker === 'revoked' && entry.fingerprint === presented.fingerprint
    )
    if (revoked) {
      return { outcome: 'revoked', presented, trusted }
    }

    if (trusted.length === 0) {
      this.writePin(host, port, presented)
      return { outcome: 'pinned', presented, trusted }
    }

    const match = trusted.find((key) => key.fingerprint === presented.fingerprint)
    if (!match) {
      return { outcome: 'mismatch', presented, trusted }
    }
    // Why: a user who fixed their own known_hosts after a legitimate rotation must not stay
    // blocked by our stale pin, so an authoritative known_hosts match re-pins in place.
    if (match.source === 'user-known-hosts') {
      this.writePin(host, port, presented)
    }
    return { outcome: 'trusted', presented, trusted }
  }

  /** Deliberate per-host re-pin: drops Muster's pins so the next connect trusts on first use. */
  forgetPins(host: string, port: number): boolean {
    const pins = this.loadPins()
    if (!pins.delete(pinKey(host, port))) {
      return false
    }
    this.persistPins(pins)
    return true
  }

  private writePin(host: string, port: number, presented: PresentedHostKey): void {
    const pins = this.loadPins()
    const key = pinKey(host, port)
    const existing = pins.get(key) ?? []
    if (existing.some((record) => record.fingerprint === presented.fingerprint)) {
      return
    }
    // One pin per key type: a rotated key of the same type replaces its predecessor only
    // after `verify` has already accepted it against known_hosts.
    const retained = existing.filter((record) => record.keyType !== presented.keyType)
    pins.set(key, [
      ...retained,
      {
        keyType: presented.keyType,
        fingerprint: presented.fingerprint,
        pinnedAt: new Date().toISOString()
      }
    ])
    this.persistPins(pins)
  }

  private matchingKnownHostsEntries(host: string, port: number): KnownHostsEntry[] {
    const labels = knownHostsLabels(host, port)
    const matches: KnownHostsEntry[] = []
    let skipped = 0
    for (const path of this.userKnownHostsPaths) {
      const cached = this.readKnownHostsFile(path)
      if (!cached) {
        continue
      }
      skipped += cached.skippedLines
      for (const entry of cached.entries) {
        if (knownHostsEntryMatchesHost(entry, labels)) {
          matches.push(entry)
        }
      }
    }
    this.skippedKnownHostsLines = skipped
    return matches
  }

  private readKnownHostsFile(path: string): CachedKnownHosts | null {
    try {
      const stats = statSync(path)
      const cached = this.knownHostsCache.get(path)
      if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
        return cached
      }
      const parsed = parseKnownHosts(readFileSync(path, 'utf8'))
      const fresh: CachedKnownHosts = {
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        entries: parsed.entries,
        skippedLines: parsed.skippedLines
      }
      this.knownHostsCache.set(path, fresh)
      return fresh
    } catch {
      // A missing or unreadable known_hosts simply means "no recorded keys here".
      this.knownHostsCache.delete(path)
      return null
    }
  }

  private loadPins(): Map<string, PinRecord[]> {
    if (this.pins) {
      return this.pins
    }
    const pins = new Map<string, PinRecord[]>()
    if (this.pinFilePath) {
      try {
        readPinFile(readFileSync(this.pinFilePath, 'utf8'), pins)
      } catch {
        // Absent or corrupt pin store: start over rather than blocking every SSH connection.
      }
    }
    this.pins = pins
    return pins
  }

  private persistPins(pins: Map<string, PinRecord[]>): void {
    const path = this.pinFilePath
    if (!path) {
      return
    }
    const hosts: Record<string, PinRecord[]> = {}
    for (const [key, records] of pins) {
      hosts[key] = records
    }
    try {
      mkdirSync(dirname(path), { recursive: true })
      const staging = `${path}.tmp`
      writeFileSync(staging, JSON.stringify({ version: PIN_FILE_VERSION, hosts }, null, 2), {
        mode: 0o600
      })
      renameSync(staging, path)
    } catch (err) {
      // Why: an unwritable pin file must not break SSH; the in-memory pins still guard the session.
      console.warn(`[ssh] Failed to persist host key pins to ${path}: ${String(err)}`)
    }
  }
}

function pinKey(host: string, port: number): string {
  return `${normalizeKnownHostsHostname(host)}:${port}`
}

function readPinFile(raw: string, into: Map<string, PinRecord[]>): void {
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || !('hosts' in parsed)) {
    return
  }
  const hosts = parsed.hosts
  if (typeof hosts !== 'object' || hosts === null) {
    return
  }
  // Values stay unverified here; every record is validated by isPinRecord below.
  const hostEntries = Object.entries(hosts) as [string, unknown][]
  for (const [key, value] of hostEntries) {
    if (!Array.isArray(value)) {
      continue
    }
    const records: PinRecord[] = value.filter(isPinRecord)
    if (records.length > 0) {
      into.set(key, records)
    }
  }
}

function isPinRecord(value: unknown): value is PinRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    'keyType' in value &&
    'fingerprint' in value &&
    'pinnedAt' in value &&
    typeof value.keyType === 'string' &&
    typeof value.fingerprint === 'string' &&
    typeof value.pinnedAt === 'string'
  )
}

let sharedStore: SshKnownHostsStore | null = null
let sharedStoreOptions: SshKnownHostsStoreOptions | null = null

/**
 * Bind the shared store to userData. Until this runs (unit tests, early startup) pins are
 * in-memory only and no known_hosts file is consulted, so behavior stays hermetic.
 */
export function configureSshKnownHostsStore(options: SshKnownHostsStoreOptions): void {
  sharedStoreOptions = {
    pinFilePath: options.pinFilePath ?? null,
    userKnownHostsPaths: options.userKnownHostsPaths ?? defaultUserKnownHostsPaths()
  }
  sharedStore = null
}

export function getSshKnownHostsStore(): SshKnownHostsStore {
  sharedStore ??= new SshKnownHostsStore(sharedStoreOptions ?? {})
  return sharedStore
}

/** OpenSSH's own GlobalKnownHostsFile / UserKnownHostsFile defaults, read-only. */
function defaultUserKnownHostsPaths(): string[] {
  const home = homedir()
  const paths = [join(home, '.ssh', 'known_hosts'), join(home, '.ssh', 'known_hosts2')]
  if (process.platform !== 'win32') {
    paths.push('/etc/ssh/ssh_known_hosts', '/etc/ssh/ssh_known_hosts2')
  }
  return paths
}
