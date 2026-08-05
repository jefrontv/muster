import { describe, expect, it } from 'vitest'

import { fingerprintHostKey } from './known-hosts-fingerprint'
import { knownHostsEntryMatchesHost, parseKnownHosts } from './known-hosts-parse'
import { hashedHostField, hostKeyBlob, knownHostsLine } from './known-hosts.test-fixture'

describe('parseKnownHosts', () => {
  it('parses a plain entry and fingerprints its key', () => {
    const blob = hostKeyBlob('ssh-ed25519', 'alpha')
    const result = parseKnownHosts(knownHostsLine('example.com', 'ssh-ed25519', 'alpha'))

    expect(result.skippedLines).toBe(0)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({
      marker: null,
      keyType: 'ssh-ed25519',
      fingerprint: fingerprintHostKey(blob),
      hashed: null
    })
    expect(result.entries[0].patterns).toEqual(['example.com'])
  })

  it('skips blank lines and comments without counting them', () => {
    const content = ['', '   ', '# a comment', knownHostsLine('h', 'ssh-rsa', 'k')].join('\n')

    expect(parseKnownHosts(content)).toMatchObject({ skippedLines: 0 })
    expect(parseKnownHosts(content).entries).toHaveLength(1)
  })

  it('records @revoked and @cert-authority markers', () => {
    const content = [
      `@revoked ${knownHostsLine('example.com', 'ssh-ed25519', 'bad')}`,
      `@cert-authority ${knownHostsLine('*.example.com', 'ssh-ed25519', 'ca')}`
    ].join('\n')

    expect(parseKnownHosts(content).entries.map((entry) => entry.marker)).toEqual([
      'revoked',
      'cert-authority'
    ])
  })

  it('counts an unsupported hash type as skipped rather than matching it', () => {
    const line = knownHostsLine('|2|c2FsdA==|aGFzaA==', 'ssh-ed25519', 'alpha')

    expect(parseKnownHosts(line)).toEqual({ entries: [], skippedLines: 1 })
  })

  it('counts a key whose payload does not match its declared type as skipped', () => {
    const mismatched = `example.com ssh-ed25519 ${hostKeyBlob('ssh-rsa', 'alpha').toString('base64')}`

    expect(parseKnownHosts(mismatched)).toEqual({ entries: [], skippedLines: 1 })
  })

  it('counts a malformed line as skipped', () => {
    expect(parseKnownHosts('example.com ssh-ed25519 not+valid+base64!!')).toEqual({
      entries: [],
      skippedLines: 1
    })
  })
})

describe('knownHostsEntryMatchesHost', () => {
  function entryFor(hostField: string) {
    const [entry] = parseKnownHosts(knownHostsLine(hostField, 'ssh-ed25519', 'alpha')).entries
    return entry
  }

  it('matches a literal hostname case-insensitively', () => {
    expect(knownHostsEntryMatchesHost(entryFor('Example.COM'), ['example.com'])).toBe(true)
  })

  it('matches any name in a comma-separated pattern list', () => {
    const entry = entryFor('alpha.test,beta.test,10.0.0.4')

    expect(knownHostsEntryMatchesHost(entry, ['beta.test'])).toBe(true)
    expect(knownHostsEntryMatchesHost(entry, ['gamma.test'])).toBe(false)
  })

  it('matches wildcard patterns', () => {
    expect(knownHostsEntryMatchesHost(entryFor('*.example.com'), ['box.example.com'])).toBe(true)
    expect(knownHostsEntryMatchesHost(entryFor('web?.example.com'), ['web1.example.com'])).toBe(
      true
    )
    expect(knownHostsEntryMatchesHost(entryFor('*.example.com'), ['example.com'])).toBe(false)
  })

  it('lets a negated pattern veto a wildcard match', () => {
    const entry = entryFor('*.example.com,!secret.example.com')

    expect(knownHostsEntryMatchesHost(entry, ['box.example.com'])).toBe(true)
    expect(knownHostsEntryMatchesHost(entry, ['secret.example.com'])).toBe(false)
  })

  it('matches the bracketed form for a non-default port', () => {
    const entry = entryFor('[example.com]:2222')

    expect(knownHostsEntryMatchesHost(entry, ['[example.com]:2222'])).toBe(true)
    expect(knownHostsEntryMatchesHost(entry, ['example.com'])).toBe(false)
  })

  it('matches a hashed host entry', () => {
    const [entry] = parseKnownHosts(
      knownHostsLine(hashedHostField('example.com', 'pepper'), 'ssh-ed25519', 'alpha')
    ).entries

    expect(entry.patterns).toEqual([])
    expect(knownHostsEntryMatchesHost(entry, ['example.com'])).toBe(true)
    expect(knownHostsEntryMatchesHost(entry, ['other.com'])).toBe(false)
  })
})
