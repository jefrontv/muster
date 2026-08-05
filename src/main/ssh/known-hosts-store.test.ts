import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fingerprintHostKey } from './known-hosts-fingerprint'
import { SshKnownHostsStore } from './known-hosts-store'
import { hashedHostField, hostKeyBlob, knownHostsLine } from './known-hosts.test-fixture'

const SERVER_KEY = hostKeyBlob('ssh-ed25519', 'genuine-server-key')
const IMPOSTOR_KEY = hostKeyBlob('ssh-ed25519', 'impostor-server-key')
const SERVER_FINGERPRINT = fingerprintHostKey(SERVER_KEY)
const IMPOSTOR_FINGERPRINT = fingerprintHostKey(IMPOSTOR_KEY)

let workDir = ''
let pinFilePath = ''
let knownHostsPath = ''

function storeWithKnownHosts(content?: string): SshKnownHostsStore {
  if (content !== undefined) {
    writeFileSync(knownHostsPath, content)
  }
  return new SshKnownHostsStore({
    pinFilePath,
    userKnownHostsPaths: content === undefined ? [] : [knownHostsPath]
  })
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'orca-known-hosts-'))
  pinFilePath = join(workDir, 'pins', 'ssh-known-hosts.json')
  knownHostsPath = join(workDir, 'known_hosts')
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe('SshKnownHostsStore trust on first use', () => {
  it('pins an unknown host on first contact and persists it', () => {
    const store = storeWithKnownHosts()

    expect(store.verify('example.com', 22, SERVER_KEY)).toMatchObject({
      outcome: 'pinned',
      presented: { keyType: 'ssh-ed25519', fingerprint: SERVER_FINGERPRINT }
    })

    const persisted: unknown = JSON.parse(readFileSync(pinFilePath, 'utf8'))
    expect(JSON.stringify(persisted)).toContain(SERVER_FINGERPRINT)
  })

  it('accepts the same key on reconnect', () => {
    storeWithKnownHosts().verify('example.com', 22, SERVER_KEY)

    // A fresh instance proves the pin came back off disk, not out of memory.
    expect(storeWithKnownHosts().verify('example.com', 22, SERVER_KEY)).toMatchObject({
      outcome: 'trusted'
    })
  })

  it('refuses a different key for a pinned host and reports what it trusted', () => {
    const store = storeWithKnownHosts()
    store.verify('example.com', 22, SERVER_KEY)

    const verdict = store.verify('example.com', 22, IMPOSTOR_KEY)

    expect(verdict.outcome).toBe('mismatch')
    expect(verdict.presented.fingerprint).toBe(IMPOSTOR_FINGERPRINT)
    expect(verdict.trusted).toEqual([
      { keyType: 'ssh-ed25519', fingerprint: SERVER_FINGERPRINT, source: 'muster-pin' }
    ])
  })

  it('keys pins by port so the same hostname on another port pins independently', () => {
    const store = storeWithKnownHosts()
    store.verify('example.com', 22, SERVER_KEY)

    expect(store.verify('example.com', 2222, IMPOSTOR_KEY).outcome).toBe('pinned')
  })

  it('treats the hostname case-insensitively', () => {
    const store = storeWithKnownHosts()
    store.verify('Example.COM', 22, SERVER_KEY)

    expect(store.verify('example.com', 22, SERVER_KEY).outcome).toBe('trusted')
  })

  it('re-pins on the next connect after an explicit forget', () => {
    const store = storeWithKnownHosts()
    store.verify('example.com', 22, SERVER_KEY)

    expect(store.forgetPins('example.com', 22)).toBe(true)
    expect(store.verify('example.com', 22, IMPOSTOR_KEY).outcome).toBe('pinned')
  })

  it('keeps pins in memory when no pin file is configured', () => {
    const store = new SshKnownHostsStore()

    expect(store.verify('example.com', 22, SERVER_KEY).outcome).toBe('pinned')
    expect(store.verify('example.com', 22, SERVER_KEY).outcome).toBe('trusted')
    expect(store.verify('example.com', 22, IMPOSTOR_KEY).outcome).toBe('mismatch')
  })
})

describe('SshKnownHostsStore and the user known_hosts file', () => {
  it('honors an existing known_hosts entry without pinning first', () => {
    const store = storeWithKnownHosts(
      knownHostsLine('example.com', 'ssh-ed25519', 'genuine-server-key')
    )

    expect(store.verify('example.com', 22, SERVER_KEY)).toMatchObject({ outcome: 'trusted' })
  })

  it('refuses a key that known_hosts does not list for the host', () => {
    const store = storeWithKnownHosts(
      knownHostsLine('example.com', 'ssh-ed25519', 'genuine-server-key')
    )

    const verdict = store.verify('example.com', 22, IMPOSTOR_KEY)

    expect(verdict.outcome).toBe('mismatch')
    expect(verdict.trusted).toEqual([
      { keyType: 'ssh-ed25519', fingerprint: SERVER_FINGERPRINT, source: 'user-known-hosts' }
    ])
  })

  it('honors a hashed known_hosts entry', () => {
    const store = storeWithKnownHosts(
      knownHostsLine(hashedHostField('example.com', 'salty'), 'ssh-ed25519', 'genuine-server-key')
    )

    expect(store.verify('example.com', 22, SERVER_KEY).outcome).toBe('trusted')
  })

  it('refuses a key marked @revoked even when another entry trusts it', () => {
    const store = storeWithKnownHosts(
      [
        knownHostsLine('example.com', 'ssh-ed25519', 'genuine-server-key'),
        `@revoked ${knownHostsLine('example.com', 'ssh-ed25519', 'genuine-server-key')}`
      ].join('\n')
    )

    expect(store.verify('example.com', 22, SERVER_KEY).outcome).toBe('revoked')
  })

  it('adopts a known_hosts key into its own pins so a fixed known_hosts unblocks the host', () => {
    const store = storeWithKnownHosts(
      knownHostsLine('example.com', 'ssh-ed25519', 'genuine-server-key')
    )
    store.verify('example.com', 22, SERVER_KEY)

    const pinsOnly = new SshKnownHostsStore({ pinFilePath, userKnownHostsPaths: [] })
    expect(pinsOnly.verify('example.com', 22, SERVER_KEY).outcome).toBe('trusted')
  })

  it('treats undecodable known_hosts lines as absent and counts them', () => {
    const store = storeWithKnownHosts(
      [
        '|2|c2FsdA==|aGFzaA== ssh-ed25519 bm90LWEta2V5',
        'example.com ssh-ed25519 not+base64!!'
      ].join('\n')
    )

    expect(store.verify('example.com', 22, SERVER_KEY).outcome).toBe('pinned')
    expect(store.getSkippedKnownHostsLines()).toBe(2)
  })

  it('never writes to the user known_hosts file', () => {
    const original = knownHostsLine('other.com', 'ssh-ed25519', 'unrelated')
    const store = storeWithKnownHosts(original)

    store.verify('example.com', 22, SERVER_KEY)

    expect(readFileSync(knownHostsPath, 'utf8')).toBe(original)
  })

  it('reports the key types it already trusts for algorithm negotiation', () => {
    const store = storeWithKnownHosts(
      [
        knownHostsLine('example.com', 'ssh-rsa', 'rsa-key'),
        knownHostsLine('example.com', 'ssh-ed25519', 'genuine-server-key')
      ].join('\n')
    )

    expect(store.getTrustedKeyTypes('example.com', 22).sort()).toEqual(['ssh-ed25519', 'ssh-rsa'])
  })
})
