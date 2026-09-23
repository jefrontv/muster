import { describe, expect, it } from 'vitest'
import { buildDomainRewritePairs } from './wp-domain-rewrite-pairs'

describe('buildDomainRewritePairs', () => {
  // jefrontv/muster#29: the live domain arrived with the prefix and the bare pass rewrote
  // `www.graypuksand.com.au` to `www.graypuksand.local`, a host nothing serves.
  it('produces the same two pairs whether or not the live domain carries www.', () => {
    const expected = [
      { from: 'www.graypuksand.com.au', to: 'graypuksand.local' },
      { from: 'graypuksand.com.au', to: 'graypuksand.local' }
    ]
    expect(buildDomainRewritePairs('www.graypuksand.com.au', 'graypuksand.local')).toEqual(expected)
    expect(buildDomainRewritePairs('graypuksand.com.au', 'graypuksand.local')).toEqual(expected)
  })

  it('puts the www pair first, so the bare pass cannot eat those rows', () => {
    const [first] = buildDomainRewritePairs('acme.com.au', 'acme.local')
    expect(first).toEqual({ from: 'www.acme.com.au', to: 'acme.local' })
  })

  it('lowercases and trims both hosts', () => {
    expect(buildDomainRewritePairs('  WWW.Foo.com ', ' Foo.LOCAL ')).toEqual([
      { from: 'www.foo.com', to: 'foo.local' },
      { from: 'foo.com', to: 'foo.local' }
    ])
  })

  it('strips only one leading www.', () => {
    expect(buildDomainRewritePairs('www.www.foo.com', 'foo.local')[1]).toEqual({
      from: 'www.foo.com',
      to: 'foo.local'
    })
  })

  it('returns nothing when a host is blank or both name the same site', () => {
    expect(buildDomainRewritePairs('', 'acme.local')).toEqual([])
    expect(buildDomainRewritePairs('acme.com.au', '   ')).toEqual([])
    expect(buildDomainRewritePairs('acme.local', 'acme.local')).toEqual([])
    expect(buildDomainRewritePairs('www.acme.local', 'acme.local')).toEqual([])
  })

  it('flips the other scheme first when the local scheme is known', () => {
    expect(buildDomainRewritePairs('acme.com.au', 'acme.local', 'http')).toEqual([
      { from: 'https://www.acme.com.au', to: 'http://acme.local' },
      { from: 'https://acme.com.au', to: 'http://acme.local' },
      { from: 'www.acme.com.au', to: 'acme.local' },
      { from: 'acme.com.au', to: 'acme.local' }
    ])
    expect(buildDomainRewritePairs('acme.com.au', 'acme.local', 'https')[1]).toEqual({
      from: 'http://acme.com.au',
      to: 'https://acme.local'
    })
  })
})
