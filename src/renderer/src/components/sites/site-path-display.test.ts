import { describe, expect, it } from 'vitest'
import { formatSitePathForRow } from './site-path-display'

const ROOTS = ['/Users/jake/Documents/Sites', '/Users/jake/Documents/Sites/mpac']

describe('formatSitePathForRow', () => {
  it('says nothing when the name already identifies the folder', () => {
    expect(formatSitePathForRow('/Users/jake/Documents/Sites/acme', ROOTS)).toBe('')
  })

  it('keeps only the part that distinguishes a nested site', () => {
    expect(formatSitePathForRow('/Users/jake/Documents/Sites/clients/acme', ROOTS)).toBe('clients/')
  })

  it('describes a site against the closest root, not the outermost one', () => {
    // Both roots match; reporting 'mpac/' would re-state the root the user is already inside.
    expect(formatSitePathForRow('/Users/jake/Documents/Sites/mpac/acme', ROOTS)).toBe('')
  })

  it('falls back to the full path when the site is outside every root', () => {
    expect(formatSitePathForRow('/Volumes/external/acme', ROOTS)).toBe('/Volumes/external/acme')
  })

  it('shows the full path when no roots are known yet', () => {
    expect(formatSitePathForRow('/Users/jake/Documents/Sites/acme', [])).toBe(
      '/Users/jake/Documents/Sites/acme'
    )
  })

  it('does not treat a sibling with a shared prefix as nested', () => {
    // '/Sites-archive' starts with '/Sites' as a string but is a different directory.
    expect(formatSitePathForRow('/Users/jake/Documents/Sites-archive/acme', ROOTS)).toBe(
      '/Users/jake/Documents/Sites-archive/acme'
    )
  })

  it('handles Windows separators', () => {
    expect(formatSitePathForRow(String.raw`C:\Sites\clients\acme`, [String.raw`C:\Sites`])).toBe(
      'clients/'
    )
  })

  it('returns nothing for an empty path rather than inventing a line', () => {
    expect(formatSitePathForRow('', ROOTS)).toBe('')
  })
})

describe('formatSitePathForRow resilience', () => {
  it('falls back to the full path instead of throwing when roots are missing', () => {
    // Regression: a hot-reloaded parent handed this `undefined` and `.map` took down the whole
    // Sites page through the error boundary — for a purely cosmetic label.
    const noRoots = undefined as unknown as readonly string[]

    expect(() => formatSitePathForRow('/Users/jake/Documents/Sites/acme', noRoots)).not.toThrow()
    expect(formatSitePathForRow('/Users/jake/Documents/Sites/acme', noRoots)).toBe(
      '/Users/jake/Documents/Sites/acme'
    )
  })
})
