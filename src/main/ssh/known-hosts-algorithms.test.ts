import { describe, expect, it } from 'vitest'

import {
  orderServerHostKeyAlgorithms,
  ssh2DefaultServerHostKeyAlgorithms
} from './known-hosts-algorithms'

describe('orderServerHostKeyAlgorithms', () => {
  it('returns null when nothing is trusted yet', () => {
    expect(orderServerHostKeyAlgorithms([])).toBeNull()
  })

  it('returns null when the trusted type already leads the default order', () => {
    const [first] = ssh2DefaultServerHostKeyAlgorithms()

    expect(orderServerHostKeyAlgorithms([first])).toBeNull()
  })

  it('promotes a trusted ECDSA type ahead of the default order', () => {
    const ordered = orderServerHostKeyAlgorithms(['ecdsa-sha2-nistp384'])

    expect(ordered?.[0]).toBe('ecdsa-sha2-nistp384')
    expect(ordered?.slice(1)).toEqual(
      ssh2DefaultServerHostKeyAlgorithms().filter((name) => name !== 'ecdsa-sha2-nistp384')
    )
  })

  it('expands a pinned ssh-rsa key into every RFC 8332 signature variant', () => {
    const ordered = orderServerHostKeyAlgorithms(['ssh-rsa'])

    expect(ordered?.slice(0, 3)).toEqual(['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'])
  })

  it('ignores key types ssh2 cannot negotiate', () => {
    expect(orderServerHostKeyAlgorithms(['unknown', 'ssh-dss'])).toBeNull()
  })

  it('never drops an algorithm from the default set', () => {
    const ordered = orderServerHostKeyAlgorithms(['ssh-rsa'])

    expect([...(ordered ?? [])].sort()).toEqual([...ssh2DefaultServerHostKeyAlgorithms()].sort())
  })
})
